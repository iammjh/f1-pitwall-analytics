import { describe, expect, it, vi } from 'vitest';
import { mapRaceForSync, resolveSyncSeason, syncRaceSchedules } from './race-sync';

const race = {
  season: '2025',
  round: '1',
  raceName: 'Australian Grand Prix',
  Circuit: { circuitName: 'Albert Park Grand Prix Circuit' },
  date: '2025-03-16',
  time: '04:00:00Z',
};

type RaceRow = ReturnType<typeof mapRaceForSync> & { id: string; status: string };

function createStore(initial: RaceRow[] = []) {
  const rows = initial.map((row) => ({ ...row }));
  type Store = Parameters<typeof syncRaceSchedules>[2];
  const store: Store = {
    findFirst: vi.fn(async ({ where }: Parameters<Store['findFirst']>[0]) => rows.find((row) => row.season === where.season && row.round === where.round) ?? null),
    update: vi.fn(async ({ where, data }: Parameters<Store['update']>[0]) => {
      const row = rows.find((item) => item.id === where.id);
      if (!row) throw new Error('Race not found');
      Object.assign(row, data);
      return row;
    }),
    upsert: vi.fn(async ({ where, create, update }: Parameters<Store['upsert']>[0]) => {
      const row = rows.find((item) => item.raceId === where.raceId);
      if (row) {
        Object.assign(row, update);
        return row;
      }
      const created = { id: `race-${rows.length + 1}`, ...create };
      rows.push(created);
      return created;
    }),
  };
  return { rows, store };
}

describe('race schedule sync', () => {
  it('maps Jolpica race and circuit names and gives each season its own race ID', () => {
    const mapped = mapRaceForSync(race, 2025);
    expect(mapped).toEqual({
      raceId: 2025001,
      season: 2025,
      round: 1,
      name: race.raceName,
      circuit: race.Circuit.circuitName,
      date: new Date('2025-03-16'),
      time: '04:00:00Z',
    });
    expect(mapRaceForSync({ ...race, season: '2026' }, 2026).raceId).not.toBe(mapped.raceId);
  });

  it('stores the same round in two seasons without replacing either race', async () => {
    const { rows, store } = createStore();
    expect(await syncRaceSchedules([race], 2025, store)).toBe(1);
    await syncRaceSchedules([{ ...race, season: '2026', date: '2026-03-08' }], 2026, store);
    expect(rows.map(({ raceId, season, round }) => ({ raceId, season, round }))).toEqual([
      { raceId: 2025001, season: 2025, round: 1 },
      { raceId: 2026001, season: 2026, round: 1 },
    ]);
    expect(rows.every(({ status }) => status === 'scheduled')).toBe(true);
  });

  it.each(['live', 'completed'])('rekeys a legacy row in place, refreshes metadata and keeps %s status', async (status) => {
    const { rows, store } = createStore([{
      ...mapRaceForSync(race, 2025),
      raceId: 1,
      id: 'existing-object-id-used-by-results',
      status,
    }]);
    await syncRaceSchedules([{
      ...race,
      raceName: 'Updated Grand Prix',
      Circuit: { circuitName: 'Updated Circuit' },
      date: '2025-03-17',
      time: undefined,
    }], 2025, store);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'existing-object-id-used-by-results',
      raceId: 2025001,
      name: 'Updated Grand Prix',
      circuit: 'Updated Circuit',
      date: new Date('2025-03-17'),
      time: null,
      status,
    });
    expect(store.update).toHaveBeenCalledWith({
      where: { id: 'existing-object-id-used-by-results' },
      data: expect.not.objectContaining({ status: expect.anything() }),
    });
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it('validates the complete response before writing any races', async () => {
    const { store } = createStore();
    await expect(syncRaceSchedules([race, { ...race, round: '2', raceName: '' }], 2025, store)).rejects.toThrow('Race name');
    expect(store.findFirst).not.toHaveBeenCalled();
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it('keeps race status when an existing encoded ID is encountered during upsert', async () => {
    const { rows, store } = createStore([{
      ...mapRaceForSync(race, 2025),
      id: 'concurrently-created-race',
      status: 'completed',
    }]);
    // Another worker can create the row between the initial lookup and upsert.
    vi.mocked(store.findFirst).mockResolvedValue(null);
    await syncRaceSchedules([{ ...race, raceName: 'Refreshed Name' }], 2025, store);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Refreshed Name', status: 'completed' });
    expect(store.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.not.objectContaining({ status: expect.anything() }),
    }));
  });

  it('rejects mismatched seasons and round numbers that could overlap another season', () => {
    expect(() => mapRaceForSync(race, 2026)).toThrow('does not match');
    for (const round of ['1bad', '0', '1000']) {
      expect(() => mapRaceForSync({ ...race, round }, 2025)).toThrow('Invalid round');
    }
    expect(() => mapRaceForSync({ ...race, date: '2025-02-30' }, 2025)).toThrow('Invalid race date');
  });
});

describe('sync season resolution', () => {
  const now = new Date('2026-01-02T12:00:00Z');

  it('uses the execution year for recurring jobs carrying last year in their payload', () => {
    expect(resolveSyncSeason(2025, { recurring: true, now })).toBe(2026);
    expect(resolveSyncSeason(undefined, { now })).toBe(2026);
  });

  it('keeps explicitly requested historical seasons on one-off jobs', () => {
    expect(resolveSyncSeason('2024', { now })).toBe(2024);
    expect(() => resolveSyncSeason('2024bad', { now })).toThrow('Invalid season');
  });
});
