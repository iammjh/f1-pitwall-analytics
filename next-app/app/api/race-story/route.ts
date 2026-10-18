import { NextRequest, NextResponse } from 'next/server';
import { FIRST_LAP_SEASON, loadRaceStory } from '@/lib/race-story-data';
import { createTtlCache, enforcePublicRateLimit, publicCacheHeaders } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

const CACHE_MS = 60 * 60 * 1000;
const storyCache = createTtlCache<object>(CACHE_MS);

export async function GET(req: NextRequest) {
  const limited = enforcePublicRateLimit(req, 'race-story');
  if (limited) return limited;

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
  const cached = storyCache.get(key);
  if (cached) return NextResponse.json(cached, { headers: publicCacheHeaders(CACHE_MS / 1000) });

  try {
    const payload = await loadRaceStory(season, round);
    if (!payload) return NextResponse.json({ error: 'That race has no results yet.' }, { status: 404 });
    storyCache.set(key, payload);
    return NextResponse.json(payload, { headers: publicCacheHeaders(CACHE_MS / 1000) });
  } catch (error) {
    console.error('Race story error:', error);
    return NextResponse.json({ error: 'Could not load the race story right now.' }, { status: 502 });
  }
}
