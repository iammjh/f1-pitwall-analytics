import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth-config';
import { buildRaceFacts, generateRecap, RECAP_MODEL, RecapError } from '@/lib/race-recap';
import { FIRST_LAP_SEASON, loadRaceStory } from '@/lib/race-story-data';
import { createTtlCache, enforcePublicRateLimit, publicCacheHeaders } from '@/lib/public-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// A finished race never changes, so its recap is written once and kept for a day.
const CACHE_MS = 24 * 60 * 60 * 1000;
const recapCache = createTtlCache<object>(CACHE_MS);

/**
 * AI recap of one race. It needs a signed-in user, because each recap is a model call with a free-tier limit. The
 * model writes from race facts computed in code (lib/race-recap.ts), and each race is generated once.
 */
export async function GET(req: NextRequest) {
  const limited = enforcePublicRateLimit(req, 'race-recap');
  if (limited) return limited;

  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in to generate a race recap.' }, { status: 401 });
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI recaps are not configured on this server yet.' }, { status: 503 });
  }

  const season = Number(req.nextUrl.searchParams.get('season'));
  const round = Number(req.nextUrl.searchParams.get('round'));
  const maxSeason = new Date().getFullYear() + 1;
  if (!Number.isInteger(season) || season < FIRST_LAP_SEASON || season > maxSeason) {
    return NextResponse.json({ error: `season must be between ${FIRST_LAP_SEASON} and ${maxSeason}.` }, { status: 400 });
  }
  if (!Number.isInteger(round) || round < 1 || round > 30) {
    return NextResponse.json({ error: 'round must be a whole number from 1 to 30.' }, { status: 400 });
  }

  const key = `${season}:${round}`;
  const cached = recapCache.get(key);
  if (cached) return NextResponse.json(cached, { headers: publicCacheHeaders(CACHE_MS / 1000) });

  try {
    const race = await loadRaceStory(season, round);
    if (!race) return NextResponse.json({ error: 'That race has no results yet.' }, { status: 404 });
    if (!race.available) {
      return NextResponse.json({ error: 'There is no lap timing for this race, so there is nothing to write from.' }, { status: 422 });
    }

    const text = await generateRecap(apiKey, buildRaceFacts(race));
    const payload = { season, round, raceName: race.raceName, text, model: RECAP_MODEL };
    recapCache.set(key, payload);
    return NextResponse.json(payload, { headers: publicCacheHeaders(CACHE_MS / 1000) });
  } catch (error) {
    if (error instanceof RecapError) {
      const status = error.reason === 'rate-limited' ? 429 : error.reason === 'provider' ? 502 : 422;
      return NextResponse.json({ error: `${error.message} Try again later.` }, { status });
    }
    console.error('Race recap error:', error);
    return NextResponse.json({ error: 'Could not write the recap right now.' }, { status: 502 });
  }
}
