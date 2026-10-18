import { NextRequest, NextResponse } from 'next/server';
import { f1Api } from '@/lib/f1-api';
import { placeSamplesOnLap, type CarDataRow } from '@/lib/lap-telemetry';
import { createTtlCache, enforcePublicRateLimit, publicCacheHeaders } from '@/lib/public-api';
import { findRaceSession, type OpenF1Session } from '@/lib/openf1-session';

interface OpenF1Lap {
  lap_number: number;
  date_start: string;
  lap_duration: number | null;
}
import { OpenF1Error } from '@/lib/openf1-auth';

export const dynamic = 'force-dynamic';

/** OpenF1 car telemetry starts in 2023. */
const FIRST_TELEMETRY_SEASON = 2023;
const MAX_DRIVERS = 2;
const CACHE_MS = 60 * 60 * 1000;
const lapCache = createTtlCache<object>(CACHE_MS);

async function loadDriverLap(sessionKey: number, driverNumber: number, lapNumber: number) {
  const lapsRes = await f1Api.laps({ session_key: sessionKey, driver_number: driverNumber });
  const laps = Array.isArray(lapsRes.data) ? (lapsRes.data as OpenF1Lap[]) : [];
  const lap = laps.find((l) => l.lap_number === lapNumber);
  if (!lap || !lap.date_start) return { reason: 'lap-not-found' as const };

  // OpenF1 leaves lap 1's duration empty (the lap starts from the grid), so use the gap to the next lap start.
  const next = laps.find((l) => l.lap_number === lapNumber + 1);
  const lapDurationSec =
    lap.lap_duration ?? (next?.date_start ? (Date.parse(next.date_start) - Date.parse(lap.date_start)) / 1000 : null);
  if (!lapDurationSec || lapDurationSec <= 0) return { reason: 'lap-not-found' as const };

  const lapStartMs = Date.parse(lap.date_start);
  // Pad the window by two seconds and drop fractional seconds: OpenF1 rejects some exact-to-the-microsecond bounds.
  const windowStart = new Date(lapStartMs - 2000).toISOString().slice(0, 19);
  const windowEnd = new Date(lapStartMs + lapDurationSec * 1000 + 2000).toISOString().slice(0, 19);

  // Provider errors must remain retryable; they are not proof that this lap lacks telemetry.
  const carRes = await f1Api.carDataWindow(sessionKey, driverNumber, windowStart, windowEnd);
  const rows = Array.isArray(carRes.data) ? (carRes.data as CarDataRow[]) : [];
  const samples = placeSamplesOnLap(rows, lapStartMs, lapDurationSec);
  if (!samples.length) return { reason: 'no-car-data' as const };

  return { lapDurationSec, samples };
}

export async function GET(req: NextRequest) {
  const limited = enforcePublicRateLimit(req, 'lap-telemetry');
  if (limited) return limited;

  const params = req.nextUrl.searchParams;
  const season = Number(params.get('season'));
  const date = params.get('date') ?? '';
  const lap = Number(params.get('lap'));
  const codes = (params.get('drivers') ?? '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
  const maxSeason = new Date().getFullYear() + 1;

  if (!Number.isInteger(season) || season < FIRST_TELEMETRY_SEASON || season > maxSeason) {
    return NextResponse.json({ error: `season must be between ${FIRST_TELEMETRY_SEASON} and ${maxSeason}.` }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD.' }, { status: 400 });
  }
  if (!Number.isInteger(lap) || lap < 1 || lap > 100) {
    return NextResponse.json({ error: 'lap must be a whole number from 1 to 100.' }, { status: 400 });
  }
  if (codes.length === 0 || codes.length > MAX_DRIVERS || codes.some((c) => !/^[A-Z]{3}$/.test(c))) {
    return NextResponse.json({ error: `drivers must be 1 to ${MAX_DRIVERS} three-letter codes.` }, { status: 400 });
  }

  const key = `${season}:${date}:${lap}:${codes.join(',')}`;
  const cached = lapCache.get(key);
  if (cached) return NextResponse.json(cached, { headers: publicCacheHeaders(CACHE_MS / 1000) });

  try {
    const sessionsRes = await f1Api.sessions({ year: season, session_name: 'Race' });
    const sessions = Array.isArray(sessionsRes.data) ? (sessionsRes.data as OpenF1Session[]) : [];
    const session = findRaceSession(sessions, date);
    if (!session) {
      return NextResponse.json({ available: false, reason: 'race-session-not-found' });
    }

    const driversRes = await f1Api.drivers({ session_key: session.session_key });
    const roster = Array.isArray(driversRes.data) ? driversRes.data : [];
    const numberByCode = new Map<string, number>();
    for (const d of roster) {
      if (d?.name_acronym && d?.driver_number != null) numberByCode.set(String(d.name_acronym).toUpperCase(), Number(d.driver_number));
    }

    const drivers: Record<string, object> = {};
    const missing: Record<string, string> = {};
    for (const code of codes) {
      const driverNumber = numberByCode.get(code);
      if (driverNumber === undefined) {
        missing[code] = 'driver-not-in-session';
        continue;
      }
      const result = await loadDriverLap(session.session_key, driverNumber, lap);
      if ('samples' in result) {
        drivers[code] = { driverNumber, ...result };
      } else {
        missing[code] = result.reason;
      }
    }

    const payload = {
      available: Object.keys(drivers).length > 0,
      session: { sessionKey: session.session_key, name: session.session_name, dateStart: session.date_start },
      lap,
      drivers,
      missing,
    };
    const endMs = Date.parse(session.date_end || '');
    const stable = Number.isFinite(endMs) && endMs <= Date.now() - 30 * 60_000;
    const cacheable = payload.available && Object.keys(missing).length === 0 && stable;
    if (cacheable) lapCache.set(key, payload);
    return NextResponse.json(payload, {
      headers: cacheable ? publicCacheHeaders(CACHE_MS / 1000) : { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof OpenF1Error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Lap telemetry error:', error);
    return NextResponse.json({ error: 'Could not load lap telemetry right now.' }, { status: 502 });
  }
}
