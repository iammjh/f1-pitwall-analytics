import { NextResponse } from 'next/server';
import { f1Api } from '@/lib/f1-api';
import { selectPreferredSession } from '@/lib/live-telemetry';
import { parseSeasonParam } from '@/lib/query-params';
import { createTtlCache, enforcePublicRateLimit, publicCacheHeaders } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

const headshotsCache = createTtlCache<object>(15 * 60 * 1000);

function normalizeDriverHeadshotEntry(driver: any) {
  const firstName = driver?.first_name || '';
  const lastName = driver?.last_name || '';
  const fullName =
    driver?.full_name ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    null;

  return {
    driverNumber:
      driver?.driver_number === undefined || driver?.driver_number === null
        ? null
        : Number(driver.driver_number),
    code: driver?.name_acronym || null,
    firstName: firstName || null,
    lastName: lastName || null,
    fullName,
    teamName: driver?.team_name || null,
    headshotUrl: driver?.headshot_url || null,
  };
}

export async function GET(request: Request) {
  const limited = enforcePublicRateLimit(request, 'headshots');
  if (limited) return limited;

  try {
    const searchParams = new URL(request.url).searchParams;
    const seasonResult = parseSeasonParam(searchParams.get('season'));
    if (!seasonResult.ok) {
      return NextResponse.json({ error: seasonResult.error }, { status: 400 });
    }
    const season = seasonResult.value;

    const cached = headshotsCache.get(String(season));
    if (cached) return NextResponse.json(cached, { headers: publicCacheHeaders(900) });

    const sessionsResult = await f1Api.sessions({ year: season });
    const sessions = Array.isArray(sessionsResult.data) ? sessionsResult.data : [];

    const session =
      selectPreferredSession(sessions, { preferRace: true, allowScheduledFallback: false }) ||
      selectPreferredSession(sessions, { preferRace: false, allowScheduledFallback: true }) ||
      sessions.at(-1) ||
      null;

    if (!session?.session_key) {
      const empty = { season, sessionKey: null, drivers: [] };
      headshotsCache.set(String(season), empty);
      return NextResponse.json(empty, { headers: publicCacheHeaders(900) });
    }

    const driversResult = await f1Api.drivers({ session_key: session.session_key });
    const rawDrivers = Array.isArray(driversResult.data) ? driversResult.data : [];

    const payload = {
      season,
      sessionKey: session.session_key,
      drivers: rawDrivers.map(normalizeDriverHeadshotEntry),
    };
    headshotsCache.set(String(season), payload);
    return NextResponse.json(payload, { headers: publicCacheHeaders(900) });
  } catch (error) {
    console.error('Driver headshots API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch driver headshots' },
      { status: 500 }
    );
  }
}
