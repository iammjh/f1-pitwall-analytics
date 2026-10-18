export const JOLPICA_BASE = process.env.ERGAST_API || 'https://api.jolpi.ca/ergast/f1';

/** GET a Jolpica (Ergast-compatible) JSON document. Throws on HTTP errors and timeouts. */
export async function getJolpicaJson(path: string) {
  const res = await fetch(`${JOLPICA_BASE}/${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Jolpica responded ${res.status} for ${path}`);
  return res.json();
}

/**
 * Jolpica pages race lists by race (100 per page). Collects every page of `races` for a
 * results or laps path such as `drivers/hamilton` or `constructors/mercedes`.
 */
export async function fetchPagedRaces(path: string, pageSize = 100, maxPages = 40): Promise<any[]> {
  const races: any[] = [];
  let offset = 0;
  let total = Infinity;
  for (let page = 0; page < maxPages && offset < total; page++) {
    const data = await getJolpicaJson(`${path}/results.json?limit=${pageSize}&offset=${offset}`);
    total = Number(data?.MRData?.total ?? 0);
    const pageRaces = data?.MRData?.RaceTable?.Races ?? [];
    if (!pageRaces.length) break;
    races.push(...pageRaces);
    offset += pageSize;
  }
  return races;
}
