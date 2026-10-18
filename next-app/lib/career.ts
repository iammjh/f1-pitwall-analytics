/** Jolpica race-results entry, flattened from a race so each driver result is one row. */
export interface CareerResult {
  season: string;
  raceName: string;
  position: string;
  grid: string;
  points: string;
  status: string;
  driverId: string;
  driverName: string;
  constructorId: string;
  constructorName: string;
  fastestLapRank?: string;
}

export interface DriverCareerSeason {
  season: string;
  team: string;
  races: number;
  points: number;
  wins: number;
  podiums: number;
  poles: number;
}

export interface DriverCareerTotals {
  starts: number;
  wins: number;
  podiums: number;
  poles: number;
  fastestLaps: number;
  points: number;
  dnfs: number;
  seasons: number;
}

export interface DriverCareer {
  totals: DriverCareerTotals;
  seasons: DriverCareerSeason[];
}

export interface ConstructorCareerSeason {
  season: string;
  entries: number;
  points: number;
  wins: number;
  podiums: number;
  drivers: string[];
}

export interface ConstructorCareerTotals {
  entries: number;
  wins: number;
  podiums: number;
  poles: number;
  fastestLaps: number;
  points: number;
  seasons: number;
}

export interface ConstructorCareer {
  totals: ConstructorCareerTotals;
  seasons: ConstructorCareerSeason[];
}

/** Finished, or classified after lapping (e.g. "+1 Lap"). Anything else counts as a DNF. */
export function isClassified(status: string): boolean {
  return status === 'Finished' || /^\+\d+ Laps?$/.test(status);
}

/** Flattens Jolpica race objects into one row per driver result. */
export function flattenRaceResults(races: any[] = []): CareerResult[] {
  const rows: CareerResult[] = [];
  for (const race of races) {
    for (const result of race?.Results ?? []) {
      rows.push({
        season: String(race.season),
        raceName: race.raceName ?? '',
        position: String(result.position ?? ''),
        grid: String(result.grid ?? ''),
        points: String(result.points ?? '0'),
        status: result.status ?? '',
        driverId: result.Driver?.driverId ?? '',
        driverName: [result.Driver?.givenName, result.Driver?.familyName].filter(Boolean).join(' '),
        constructorId: result.Constructor?.constructorId ?? '',
        constructorName: result.Constructor?.name ?? '',
        fastestLapRank: result.FastestLap?.rank,
      });
    }
  }
  return rows;
}

const num = (value: string) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** Career totals and season-by-season breakdown for one driver's results. */
export function summarizeDriverCareer(results: CareerResult[]): DriverCareer {
  const totals: DriverCareerTotals = { starts: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, points: 0, dnfs: 0, seasons: 0 };
  const bySeason = new Map<string, DriverCareerSeason>();

  for (const row of results) {
    const position = num(row.position);
    const classified = isClassified(row.status);
    const win = classified && position === 1;
    const podium = classified && position >= 1 && position <= 3;
    const pole = row.grid === '1';
    const fastest = row.fastestLapRank === '1';

    totals.starts += 1;
    totals.points += num(row.points);
    if (win) totals.wins += 1;
    if (podium) totals.podiums += 1;
    if (pole) totals.poles += 1;
    if (fastest) totals.fastestLaps += 1;
    if (!classified) totals.dnfs += 1;

    const season = bySeason.get(row.season) ?? { season: row.season, team: row.constructorName, races: 0, points: 0, wins: 0, podiums: 0, poles: 0 };
    season.team = row.constructorName || season.team;
    season.races += 1;
    season.points += num(row.points);
    if (win) season.wins += 1;
    if (podium) season.podiums += 1;
    if (pole) season.poles += 1;
    bySeason.set(row.season, season);
  }

  const seasons = [...bySeason.values()].sort((a, b) => Number(b.season) - Number(a.season));
  totals.seasons = seasons.length;
  return { totals, seasons };
}

/** Career totals and season-by-season breakdown for one constructor's results (both cars). */
export function summarizeConstructorCareer(results: CareerResult[]): ConstructorCareer {
  const totals: ConstructorCareerTotals = { entries: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, points: 0, seasons: 0 };
  const bySeason = new Map<string, ConstructorCareerSeason & { driverSet: Set<string> }>();

  for (const row of results) {
    const position = num(row.position);
    const classified = isClassified(row.status);
    const win = classified && position === 1;
    const podium = classified && position >= 1 && position <= 3;

    totals.entries += 1;
    totals.points += num(row.points);
    if (win) totals.wins += 1;
    if (podium) totals.podiums += 1;
    if (row.grid === '1') totals.poles += 1;
    if (row.fastestLapRank === '1') totals.fastestLaps += 1;

    const season = bySeason.get(row.season) ?? { season: row.season, entries: 0, points: 0, wins: 0, podiums: 0, drivers: [], driverSet: new Set<string>() };
    season.entries += 1;
    season.points += num(row.points);
    if (win) season.wins += 1;
    if (podium) season.podiums += 1;
    if (row.driverName && !season.driverSet.has(row.driverName)) {
      season.driverSet.add(row.driverName);
      season.drivers.push(row.driverName);
    }
    bySeason.set(row.season, season);
  }

  const seasons = [...bySeason.values()]
    .map(({ driverSet: _unused, ...season }) => season)
    .sort((a, b) => Number(b.season) - Number(a.season));
  totals.seasons = seasons.length;
  return { totals, seasons };
}
