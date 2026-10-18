import { buildRaceStory, collectLaps, type RaceLapEntry, type RaceStory } from '@/lib/race-story';
import { getJolpicaJson } from '@/lib/jolpica-fetch';

export const FIRST_LAP_SEASON = 1996; // Jolpica has lap-by-lap timing from 1996.
const PAGE_SIZE = 100;
const MAX_PAGES = 40;

export interface RaceStoryDriver {
  driverId: string;
  code: string | null;
  name: string;
  constructorId: string | null;
  constructorName: string | null;
  finalPosition: number;
  grid: number;
  status: string;
  fastest: boolean;
}

export interface RaceStoryPayload {
  available: boolean;
  season: number;
  round: number;
  raceName: string;
  /** Jolpica circuit id, used to pick the track map. */
  circuitId: string | null;
  story: RaceStory;
  drivers: RaceStoryDriver[];
}

/** Lap timings are paged by timing entry (about 20 per lap), so keep requesting until the total is covered. */
async function fetchLapPages(season: number, round: number): Promise<RaceLapEntry[][]> {
  const pages: RaceLapEntry[][] = [];
  let offset = 0;
  let total = Infinity;
  for (let page = 0; page < MAX_PAGES && offset < total; page++) {
    const data = await getJolpicaJson(`${season}/${round}/laps.json?limit=${PAGE_SIZE}&offset=${offset}`);
    total = Number(data?.MRData?.total ?? 0);
    const laps: RaceLapEntry[] = data?.MRData?.RaceTable?.Races?.[0]?.Laps ?? [];
    if (!laps.length) break;
    pages.push(laps);
    offset += PAGE_SIZE;
  }
  return pages;
}

/** Full race story for one round. Returns null when the round has no results yet. */
export async function loadRaceStory(season: number, round: number): Promise<RaceStoryPayload | null> {
  const [pages, resultsData] = await Promise.all([
    fetchLapPages(season, round),
    getJolpicaJson(`${season}/${round}/results.json?limit=50`),
  ]);
  const race = resultsData?.MRData?.RaceTable?.Races?.[0];
  if (!race) return null;

  const laps = collectLaps(pages);
  const drivers: RaceStoryDriver[] = (race.Results ?? []).map((r: any) => ({
    driverId: r.Driver?.driverId,
    code: r.Driver?.code ?? null,
    name: [r.Driver?.givenName, r.Driver?.familyName].filter(Boolean).join(' '),
    constructorId: r.Constructor?.constructorId ?? null,
    constructorName: r.Constructor?.name ?? null,
    finalPosition: Number(r.position),
    grid: Number(r.grid),
    status: String(r.status ?? ''),
    fastest: r.FastestLap?.rank === '1',
  }));

  return {
    available: laps.length > 0,
    season,
    round,
    raceName: race.raceName,
    circuitId: race.Circuit?.circuitId ?? null,
    story: buildRaceStory(laps),
    drivers,
  };
}

