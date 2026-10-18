export interface OpenF1Session {
  session_key: number;
  session_name: string;
  date_start: string;
  date_end?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The race session whose start date falls on the Grand Prix date (a day either side allowed for time zones). */
export function findRaceSession(sessions: OpenF1Session[], raceDate: string): OpenF1Session | null {
  const target = Date.parse(raceDate);
  const matches = sessions
    .filter((s) => s.session_name === 'Race')
    .map((s) => ({ session: s, gap: Math.abs(Date.parse(s.date_start.slice(0, 10)) - target) }))
    .filter((m) => m.gap <= DAY_MS)
    .sort((a, b) => a.gap - b.gap);
  return matches[0]?.session ?? null;
}
