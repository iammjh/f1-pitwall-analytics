import { NextResponse } from 'next/server';
import { f1Api } from '@/lib/f1-api';
import { fetchSeasonRaces, findNextUpcomingRace } from '@/lib/jolpica-client';
import { normalizeLiveRacePayload, selectPreferredSession } from '@/lib/live-telemetry';
import { parseSeasonParam } from '@/lib/query-params';
import { enforcePublicRateLimit, publicCacheHeaders } from '@/lib/public-api';
import { OpenF1Error } from '@/lib/openf1-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = enforcePublicRateLimit(request, 'live-race');
  if (limited) return limited;

  try {
    const searchParams = new URL(request.url).searchParams;
    const seasonResult = parseSeasonParam(searchParams.get('season'));
    if (!seasonResult.ok) {
      return NextResponse.json({ error: seasonResult.error }, { status: 400 });
    }
    const season = seasonResult.value;
    let accessFailure: OpenF1Error | null = null;

    const [sessionsResult, racesResult] = await Promise.allSettled([
      f1Api.sessions({ year: season }),
      fetchSeasonRaces(season),
    ]);
    if (sessionsResult.status === 'rejected' && sessionsResult.reason instanceof OpenF1Error) {
      accessFailure = sessionsResult.reason;
    }

    const sessions =
      sessionsResult.status === 'fulfilled' && Array.isArray(sessionsResult.value.data)
        ? sessionsResult.value.data
        : [];
    const races = racesResult.status === 'fulfilled' ? racesResult.value : [];
    const session = selectPreferredSession(sessions, { preferRace: true, allowScheduledFallback: false });

    let drivers: any[] = [];
    let positions: any[] = [];
    let laps: any[] = [];

    if (session?.session_key) {
      const [driversResult, positionsResult, lapsResult] = await Promise.allSettled([
        f1Api.drivers({ session_key: session.session_key }),
        f1Api.positions({ session_key: session.session_key }),
        f1Api.laps({ session_key: session.session_key }),
      ]);
      for (const result of [driversResult, positionsResult, lapsResult]) {
        if (result.status === 'rejected' && result.reason instanceof OpenF1Error) accessFailure = result.reason;
      }

      drivers =
        driversResult.status === 'fulfilled' && Array.isArray(driversResult.value.data)
          ? driversResult.value.data
          : [];
      positions =
        positionsResult.status === 'fulfilled' && Array.isArray(positionsResult.value.data)
          ? positionsResult.value.data
          : [];
      laps =
        lapsResult.status === 'fulfilled' && Array.isArray(lapsResult.value.data)
          ? lapsResult.value.data
          : [];
    }

    const payload = normalizeLiveRacePayload({
        session,
        upcomingRace: findNextUpcomingRace(races),
        drivers,
        positions,
        laps,
      });
    if (accessFailure) payload.message = `${payload.message} ${accessFailure.message}`;
    return NextResponse.json(payload, { headers: accessFailure ? { 'Cache-Control': 'no-store' } : publicCacheHeaders(15, 0) });
  } catch (error) {
    console.error('Live race API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch live race data' },
      { status: 500 }
    );
  }
}
