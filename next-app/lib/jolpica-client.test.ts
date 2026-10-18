import { describe, expect, it, vi } from 'vitest';
import { fetchSeasonResults, fetchSeasonSprintResults } from '@/lib/jolpica-client';

function seasonFetcher(rounds = 24, drivers = 22, upstreamPageSize = 100) {
  const rows = Array.from({ length: rounds }, (_, round) =>
    Array.from({ length: drivers }, (_, driver) => ({
      round: String(round + 1),
      result: {
        Driver: { driverId: `driver-${driver + 1}` },
        position: String(driver + 1),
      },
    })),
  ).flat();

  return vi.fn(async (url: string) => {
    const params = new URL(url).searchParams;
    const offset = Number(params.get('offset'));
    const size = Math.min(Number(params.get('limit')), upstreamPageSize);
    const races = new Map<string, { season: string; round: string; Results: (typeof rows)[number]['result'][] }>();
    for (const row of rows.slice(offset, offset + size)) {
      if (!races.has(row.round)) {
        races.set(row.round, { season: '2026', round: row.round, Results: [] });
      }
      races.get(row.round)!.Results.push(row.result);
    }
    return { MRData: { total: String(rows.length), RaceTable: { Races: [...races.values()] } } };
  });
}

describe('fetchSeasonResults', () => {
  it.each([100, 600, 1000])('loads a full season and merges split races with limit %i', async (limit) => {
    const fetcher = seasonFetcher();
    const races = await fetchSeasonResults(2026, { limit, fetcher });

    expect(races).toHaveLength(24);
    expect(races.reduce((total, race) => total + race.Results.length, 0)).toBe(528);
    expect(races.map((race) => race.Results.length)).toEqual(Array(24).fill(22));
    expect(races[4].Results.map((result: { Driver: { driverId: string } }) => result.Driver.driverId)).toEqual(
      Array.from({ length: 22 }, (_, index) => `driver-${index + 1}`),
    );
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it('advances by the returned count when upstream caps the page size', async () => {
    const fetcher = seasonFetcher(6, 22, 25);
    const races = await fetchSeasonResults(2026, { fetcher });

    expect(races.reduce((total, race) => total + race.Results.length, 0)).toBe(132);
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('offset')).toBe('25');
  });

  it('returns an empty array for a season with no results', async () => {
    expect(await fetchSeasonResults(2026, { fetcher: seasonFetcher(0) })).toEqual([]);
  });

  it('fails instead of returning partial analytics if pagination repeats a page', async () => {
    const fetchPage = seasonFetcher();
    const page = await fetchPage('https://example.com/?offset=0&limit=100');
    await expect(fetchSeasonResults(2026, { fetcher: async () => page })).rejects.toThrow(
      'pagination did not advance',
    );
  });

  it('fails instead of accepting an empty page before the reported total', async () => {
    await expect(fetchSeasonResults(2026, {
      fetcher: async () => ({ MRData: { total: '22', RaceTable: { Races: [] } } }),
    })).rejects.toThrow('incomplete results page');
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid page size %s', async (limit) => {
    const fetcher = seasonFetcher();
    await expect(fetchSeasonResults(2026, { limit, fetcher })).rejects.toThrow(RangeError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('fetchSeasonSprintResults', () => {
  function sprintFetcher(rounds = 6, drivers = 22, upstreamPageSize = 25) {
    const fetchRacePage = seasonFetcher(rounds, drivers, upstreamPageSize);
    return vi.fn(async (url: string) => {
      expect(new URL(url).pathname).toBe('/ergast/f1/2026/sprint/');
      const page = await fetchRacePage(url);
      return { MRData: { ...page.MRData, RaceTable: { Races: page.MRData.RaceTable.Races.map(({ Results, ...race }) => ({ ...race, SprintResults: Results })) } } };
    });
  }

  it('paginates sprint driver rows and merges weekends split over pages', async () => {
    const fetcher = sprintFetcher();
    const races = await fetchSeasonSprintResults(2026, { limit: 1000, fetcher });
    expect(races).toHaveLength(6);
    expect(races.map((race) => race.SprintResults.length)).toEqual(Array(6).fill(22));
    expect(races.some((race) => 'Results' in race)).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('offset')).toBe('25');
  });

  it('returns no sprints for historical seasons before sprint weekends existed', async () => {
    expect(await fetchSeasonSprintResults(2026, { fetcher: sprintFetcher(0) })).toEqual([]);
  });

  it('rejects incomplete sprint results instead of silently dropping points', async () => {
    await expect(fetchSeasonSprintResults(2026, {
      fetcher: async () => ({ MRData: { total: '22', RaceTable: { Races: [] } } }),
    })).rejects.toThrow('incomplete results page');
  });
});
