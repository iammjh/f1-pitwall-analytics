import { getJolpicaJson, fetchPagedRaces } from '@/lib/jolpica-fetch';
import { flattenRaceResults, summarizeDriverCareer } from '@/lib/career';
import { createTtlCache } from '@/lib/public-api';

const DRIVER_ID = /^[a-z0-9_-]{2,40}$/;
const CACHE_MS = 60 * 60 * 1000;
const driverCache = createTtlCache<DriverCard | null>(CACHE_MS);
const raceCache = createTtlCache<RaceCard | null>(CACHE_MS);

export interface DriverCard {
  driverId: string;
  name: string;
  code: string | null;
  number: string | null;
  nationality: string | null;
  constructorId: string | null;
  teamName: string | null;
  season: string;
  seasonPosition: number | null;
  seasonPoints: number | null;
  seasonWins: number | null;
  careerStarts: number;
  careerWins: number;
  careerPodiums: number;
  careerPoles: number;
  careerSeasons: number;
}

export interface RaceCard {
  season: string;
  round: string;
  raceName: string;
  circuit: string;
  locality: string;
  country: string;
  date: string;
  winner: { name: string; constructorId: string | null } | null;
  podium: { name: string; constructorId: string | null; position: number }[];
  fastestLap: { name: string; time: string | null } | null;
}

/** Current season if it has standings yet, otherwise the previous one. */
async function latestSeasonWithStandings(): Promise<string> {
  const current = String(new Date().getFullYear());
  for (const season of [current, String(Number(current) - 1)]) {
    const data = await getJolpicaJson(`${season}/driverStandings.json?limit=1`);
    if (data?.MRData?.StandingsTable?.StandingsLists?.length) return season;
  }
  return String(Number(current) - 1);
}

export async function loadDriverCard(driverId: string): Promise<DriverCard | null> {
  if (!DRIVER_ID.test(driverId)) return null;
  if (driverCache.get(driverId) !== undefined) return driverCache.get(driverId) ?? null;

  try {
    const [detail, races, season] = await Promise.all([
      getJolpicaJson(`drivers/${driverId}.json`),
      fetchPagedRaces(`drivers/${driverId}`),
      latestSeasonWithStandings(),
    ]);
    const driver = detail?.MRData?.DriverTable?.Drivers?.[0];
    if (!driver) {
      driverCache.set(driverId, null);
      return null;
    }

    const standings = await getJolpicaJson(`${season}/drivers/${driverId}/driverStandings.json`).catch(() => null);
    const standing = standings?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings?.[0];
    const career = summarizeDriverCareer(flattenRaceResults(races).filter((row) => row.driverId === driverId));

    const card: DriverCard = {
      driverId,
      name: [driver.givenName, driver.familyName].filter(Boolean).join(' '),
      code: driver.code ?? null,
      number: driver.permanentNumber ?? null,
      nationality: driver.nationality ?? null,
      constructorId: standing?.Constructors?.[0]?.constructorId ?? null,
      teamName: standing?.Constructors?.[0]?.name ?? null,
      season,
      seasonPosition: standing ? Number(standing.position) : null,
      seasonPoints: standing ? Number(standing.points) : null,
      seasonWins: standing ? Number(standing.wins) : null,
      careerStarts: career.totals.starts,
      careerWins: career.totals.wins,
      careerPodiums: career.totals.podiums,
      careerPoles: career.totals.poles,
      careerSeasons: career.totals.seasons,
    };
    driverCache.set(driverId, card);
    return card;
  } catch {
    return null;
  }
}

export async function loadRaceCard(season: string, round: string): Promise<RaceCard | null> {
  const key = `${season}:${round}`;
  if (raceCache.get(key) !== undefined) return raceCache.get(key) ?? null;

  try {
    const data = await getJolpicaJson(`${season}/${round}/results.json?limit=50`);
    const race = data?.MRData?.RaceTable?.Races?.[0];
    if (!race) {
      raceCache.set(key, null);
      return null;
    }
    const results: any[] = race.Results ?? [];
    const nameOf = (r: any) => [r.Driver?.givenName, r.Driver?.familyName].filter(Boolean).join(' ');
    const fastest = results.find((r) => r.FastestLap?.rank === '1');

    const card: RaceCard = {
      season,
      round,
      raceName: race.raceName,
      circuit: race.Circuit?.circuitName ?? '',
      locality: race.Circuit?.Location?.locality ?? '',
      country: race.Circuit?.Location?.country ?? '',
      date: race.date,
      winner: results[0] ? { name: nameOf(results[0]), constructorId: results[0].Constructor?.constructorId ?? null } : null,
      podium: results.slice(0, 3).map((r) => ({
        name: nameOf(r),
        constructorId: r.Constructor?.constructorId ?? null,
        position: Number(r.position),
      })),
      fastestLap: fastest ? { name: nameOf(fastest), time: fastest.FastestLap?.Time?.time ?? null } : null,
    };
    raceCache.set(key, card);
    return card;
  } catch {
    return null;
  }
}
