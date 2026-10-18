/** Race schedule persistence, independent of Bull/Redis for deterministic validation. */
type JolpicaRace = {
  season?: string | number;
  round: string | number;
  raceName: string;
  Circuit: { circuitName: string };
  date: string;
  time?: string;
};

type RaceSchedule = {
  raceId: number;
  season: number;
  round: number;
  name: string;
  circuit: string;
  date: Date;
  time: string | null;
};

type RaceStore = {
  findFirst(args: {
    where: { season: number; round: number };
    select: { id: true; raceId: true };
  }): Promise<{ id: string; raceId: number } | null>;
  update(args: { where: { id: string }; data: RaceSchedule }): Promise<unknown>;
  upsert(args: {
    where: { raceId: number };
    create: RaceSchedule & { status: string };
    update: RaceSchedule;
  }): Promise<unknown>;
};

function positiveInteger(value: unknown, name: string, min: number, max: number): number {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+$/.test(String(value))) {
    throw new Error(`Invalid ${name}`);
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`Invalid ${name}`);
  }
  return number;
}

export function resolveSyncSeason(
  requestedSeason?: unknown,
  { recurring = false, now = new Date() }: { recurring?: boolean; now?: Date } = {},
): number {
  // Old repeatable Bull jobs may still carry the year that originally scheduled them.
  return positiveInteger(
    recurring || requestedSeason == null ? now.getFullYear() : requestedSeason,
    'season',
    1950,
    9999,
  );
}

export function mapRaceForSync(race: JolpicaRace, requestedSeason: number): RaceSchedule {
  const season = resolveSyncSeason(requestedSeason);
  const round = positiveInteger(race.round, 'round', 1, 999);
  if (race.season != null && resolveSyncSeason(race.season) !== season) {
    throw new Error('Race season does not match requested season');
  }
  if (!race.raceName?.trim() || !race.Circuit?.circuitName?.trim()) {
    throw new Error('Race name and circuit name are required');
  }
  const date = new Date(race.date);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(race.date) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== race.date
  ) {
    throw new Error('Invalid race date');
  }

  return {
    // The round alone is not globally unique. Leave room for up to 999 rounds.
    raceId: season * 1000 + round,
    season,
    round,
    name: race.raceName,
    circuit: race.Circuit.circuitName,
    date,
    time: race.time ?? null,
  };
}

export async function syncRaceSchedules(races: JolpicaRace[], season: number, store: RaceStore) {
  // Validate the entire response before writing any rows.
  const schedules = races.map((race) => mapRaceForSync(race, season));
  for (const schedule of schedules) {
    const existing = await store.findFirst({
      where: { season: schedule.season, round: schedule.round },
      select: { id: true, raceId: true },
    });

    if (existing) {
      // Rekey legacy round-only IDs in place, retaining the _id used by results.
      // A schedule refresh must not reset an existing live/completed status.
      await store.update({ where: { id: existing.id }, data: schedule });
    } else {
      await store.upsert({
        where: { raceId: schedule.raceId },
        create: { ...schedule, status: 'scheduled' },
        update: schedule,
      });
    }
  }
  return schedules.length;
}
