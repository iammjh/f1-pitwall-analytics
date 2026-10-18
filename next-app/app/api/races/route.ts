import { NextRequest, NextResponse } from 'next/server';
import { getRedis, cacheKey } from '@/lib/redis';
import { f1Api } from '@/lib/f1-api';
import { parseRoundParam, parseSeasonParam } from '@/lib/query-params';
import { enforcePublicRateLimit, publicCacheHeaders } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = enforcePublicRateLimit(req, 'races');
  if (limited) return limited;

  try {
    const searchParams = req.nextUrl.searchParams;
    const seasonResult = parseSeasonParam(searchParams.get('season'));
    if (!seasonResult.ok) {
      return NextResponse.json({ error: seasonResult.error }, { status: 400 });
    }
    const season = seasonResult.value;

    const roundResult = parseRoundParam(searchParams.get('round'));
    if (roundResult && !roundResult.ok) {
      return NextResponse.json({ error: roundResult.error }, { status: 400 });
    }
    const round = roundResult?.ok ? String(roundResult.value) : null;

    const cacheKeyStr = round
      ? cacheKey.results(season, Number(round))
      : cacheKey.races(season);

    // Redis is an optional cache: when it is down, serve straight from the upstream API.
    const redis = await getRedis().catch((error) => {
      console.error('Redis unavailable, skipping race cache:', error);
      return null;
    });

    const cached = redis ? await redis.get(cacheKeyStr).catch(() => null) : null;
    if (cached) {
      return NextResponse.json(JSON.parse(cached), { headers: publicCacheHeaders(600) });
    }

    // Fetch from API
    let data;
    if (round) {
      const res = await f1Api.results(Number(season), round);
      data = res.data.MRData.RaceTable.Races[0];
    } else {
      const res = await f1Api.races(Number(season));
      data = res.data.MRData.RaceTable.Races;
    }

    // Cache for 1 hour
    await redis?.setEx(cacheKeyStr, 3600, JSON.stringify(data)).catch((error) => {
      console.error('Failed to write race cache:', error);
    });

    return NextResponse.json(data, { headers: publicCacheHeaders(600) });
  } catch (error) {
    console.error('Race API error:', error);
    return NextResponse.json({ error: 'Failed to fetch races' }, { status: 500 });
  }
}
