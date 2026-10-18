import type { MailMessage } from '@/lib/mailer';

export const RACE_ALERT_WINDOW_MS = 60 * 60 * 1000;
export const RACE_ALERT_CHANNEL = 'email';

export interface AlertRace {
  season: string;
  round: string;
  raceName: string;
  date: string;
  time?: string;
  Circuit?: { circuitName?: string; Location?: { locality?: string; country?: string } };
}

/** Race start in UTC, or null when the schedule has no start time yet. */
export function getRaceStart(race: AlertRace): Date | null {
  if (!race.time) return null;
  const start = new Date(`${race.date}T${race.time}`);
  return Number.isNaN(start.getTime()) ? null : start;
}

/** Races whose start falls in the next `windowMs` after `now`. */
export function racesStartingWithin(races: AlertRace[], now: Date, windowMs = RACE_ALERT_WINDOW_MS): AlertRace[] {
  const from = now.getTime();
  const to = from + windowMs;
  return races.filter((race) => {
    const start = getRaceStart(race)?.getTime();
    return start !== undefined && start > from && start <= to;
  });
}

/** Stable key so each race start is announced once per user. */
export function raceStartEventKey(race: Pick<AlertRace, 'season' | 'round'>): string {
  return `race-start:${race.season}:${race.round}`;
}

export function buildRaceStartMessage(race: AlertRace, to: string, appUrl: string, now: Date = new Date()): MailMessage {
  const start = getRaceStart(race);
  const minutes = start ? Math.max(1, Math.round((start.getTime() - now.getTime()) / 60000)) : null;
  const when = start
    ? start.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC'
    : 'soon';
  const circuit = race.Circuit?.circuitName ?? 'Circuit TBC';
  const place = [race.Circuit?.Location?.locality, race.Circuit?.Location?.country].filter(Boolean).join(', ');
  const headline = minutes ? `${race.raceName} starts in about ${minutes} minute${minutes === 1 ? '' : 's'}.` : `${race.raceName} is about to start.`;
  const liveUrl = `${appUrl.replace(/\/+$/, '')}/dashboard?tab=live`;

  return {
    to,
    subject: `F1 alert: ${race.raceName} starts ${minutes ? `in ${minutes} min` : 'soon'}`,
    text: [headline, '', `Circuit: ${circuit}${place ? ` (${place})` : ''}`, `Start: ${when}`, '', `Follow it live: ${liveUrl}`, '', 'You are receiving this because race-start alerts are on in your Pitwall Analytics Hub preferences.'].join('\n'),
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#121212;color:#fff;padding:20px;border-radius:8px">
  <h2 style="color:#E10600;margin-top:0">Race start alert</h2>
  <p>${escapeHtml(headline)}</p>
  <p><strong>Circuit:</strong> ${escapeHtml(circuit)}${place ? ` (${escapeHtml(place)})` : ''}<br>
  <strong>Start:</strong> ${escapeHtml(when)}</p>
  <p><a href="${escapeHtml(liveUrl)}" style="display:inline-block;background:#E10600;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px">Follow it live</a></p>
  <hr style="border-color:#333">
  <p style="font-size:12px;color:#888">You are receiving this because race-start alerts are on in your Pitwall Analytics Hub preferences.</p>
</div>`,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}
