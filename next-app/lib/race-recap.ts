import { isClassified } from '@/lib/career';
import type { RaceStoryPayload } from '@/lib/race-story-data';

// Free tier of Groq (OpenAI-compatible API). Limits are per model and listed in the Groq console.
export const RECAP_MODEL = 'openai/gpt-oss-120b';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface RaceFacts {
  raceName: string;
  season: number;
  round: number;
  laps: number;
  podium: { position: number; name: string; team: string | null; startedP: number }[];
  winnerMarginSeconds: number | null;
  leadChanges: number;
  biggestGain: { name: string; placesGained: number } | null;
  biggestDrop: { name: string; placesLost: number } | null;
  fastestLap: string | null;
  retirements: { name: string; reason: string }[];
  classifiedFinishers: number;
}

/**
 * Race facts computed in code. The model only writes prose from these; it never reads raw timing data,
 * so it has nothing to invent overtakes or incidents from.
 */
export function buildRaceFacts(payload: RaceStoryPayload): RaceFacts {
  const finishers = [...payload.drivers].sort((a, b) => a.finalPosition - b.finalPosition);
  const classified = finishers.filter((d) => isClassified(d.status));

  // A retired driver cannot be on the podium, so take the podium from classified finishers only.
  const podium = classified.slice(0, 3).map((d) => ({
    position: d.finalPosition,
    name: d.name,
    team: d.constructorName,
    startedP: d.grid,
  }));

  const second = classified[1];
  const secondGaps = second ? payload.story.gaps[second.driverId] ?? [] : [];
  const winnerMarginSeconds = [...secondGaps].reverse().find((g) => g !== null) ?? null;

  let leadChanges = 0;
  let previousLeader: string | null = null;
  payload.story.laps.forEach((_, index) => {
    const leader = payload.story.drivers.find((id) => payload.story.positions[id]?.[index] === 1) ?? null;
    if (leader && previousLeader && leader !== previousLeader) leadChanges += 1;
    if (leader) previousLeader = leader;
  });

  // Gains and losses only count classified finishers who started from the grid (grid 0 is the pit lane).
  const movers = classified
    .filter((d) => d.grid > 0)
    .map((d) => ({ name: d.name, placesGained: d.grid - d.finalPosition }));
  const gain = movers.reduce<{ name: string; placesGained: number } | null>(
    (best, m) => (m.placesGained > 0 && (!best || m.placesGained > best.placesGained) ? m : best),
    null,
  );
  const drop = movers.reduce<{ name: string; placesLost: number } | null>(
    (worst, m) => (m.placesGained < 0 && (!worst || -m.placesGained > worst.placesLost) ? { name: m.name, placesLost: -m.placesGained } : worst),
    null,
  );

  const fastest = payload.drivers.find((d) => d.fastest);
  const retirements = finishers
    .filter((d) => !isClassified(d.status))
    .slice(0, 5)
    .map((d) => ({ name: d.name, reason: d.status }));

  return {
    raceName: payload.raceName,
    season: payload.season,
    round: payload.round,
    laps: payload.story.laps.length,
    podium,
    winnerMarginSeconds,
    leadChanges,
    biggestGain: gain,
    biggestDrop: drop,
    fastestLap: fastest ? fastest.name : null,
    retirements,
    classifiedFinishers: classified.length,
  };
}

export const RECAP_SYSTEM_PROMPT = [
  'You write short race recaps for an F1 analytics hub.',
  'Use only the facts in the JSON you are given. Do not invent overtakes, incidents, penalties, quotes or reasons for anything.',
  'If a fact is null or empty, leave it out rather than guessing.',
  'Avoid judgements the facts do not state, such as dominant, brilliant or disappointing.',
  'Write two short paragraphs of plain text (about 120 to 160 words), no headings and no bullet points.',
].join(' ');

export type RecapFailure = 'rate-limited' | 'provider' | 'truncated' | 'empty';

export class RecapError extends Error {
  constructor(message: string, readonly reason: RecapFailure) {
    super(message);
    this.name = 'RecapError';
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Writes the recap with the free Groq API. The fetcher is injectable so tests need no network. */
export async function generateRecap(apiKey: string, facts: RaceFacts, fetcher: FetchLike = fetch): Promise<string> {
  const res = await fetcher(GROQ_CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: RECAP_MODEL,
      temperature: 0.4,
      max_tokens: 1500,
      // gpt-oss is a reasoning model: keep its thinking short so the recap text is not crowded out.
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: RECAP_SYSTEM_PROMPT },
        { role: 'user', content: `Race facts (JSON):\n${JSON.stringify(facts, null, 2)}` },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (res.status === 429) throw new RecapError('The free AI limit was reached for now.', 'rate-limited');
  if (!res.ok) throw new RecapError(`The AI provider returned ${res.status}.`, 'provider');

  const body = await res.json();
  const choice = body?.choices?.[0];
  if (choice?.finish_reason === 'length') throw new RecapError('The recap was cut short.', 'truncated');
  const text = String(choice?.message?.content ?? '').trim();
  if (!text) throw new RecapError('The recap came back empty.', 'empty');
  return text;
}
