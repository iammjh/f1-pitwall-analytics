/** Newest season offered in the dashboard: the current calendar year. */
export function getLatestSeason(now: Date = new Date()): number {
  return now.getFullYear();
}

/** Season options from the latest year down to `firstSeason`, newest first. */
export function getSeasonOptions(firstSeason: number, now: Date = new Date()): string[] {
  const latest = getLatestSeason(now);
  const options: string[] = [];
  for (let year = latest; year >= firstSeason; year--) options.push(String(year));
  return options;
}

/** Season selected when the dashboard first opens. */
export const DEFAULT_SEASON = String(getLatestSeason());
