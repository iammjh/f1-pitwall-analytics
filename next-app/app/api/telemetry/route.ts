import { NextResponse } from 'next/server';
import { f1Api } from '@/lib/f1-api';
import {
  getTelemetryWindowStart,
  normalizeTelemetryPayload,
  selectPreferredSession,
  selectTelemetryDriver,
} from '@/lib/live-telemetry';
import { parseSeasonParam, parseSessionKeyParam } from '@/lib/query-params';
import { enforcePublicRateLimit, publicCacheHeaders } from '@/lib/public-api';
import { OpenF1Error } from '@/lib/openf1-auth';

export const dynamic = 'force-dynamic';

interface CacheEntry {
  data: any;
  expiresAt: number;
}
const telemetryCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 128;
const LIVE_TTL_MS = 15_000;

function rejectAccessFailure(results: PromiseSettledResult<unknown>[]) {
  for (const result of results) {
    if (result.status === 'rejected' && result.reason instanceof OpenF1Error &&
      ['OPENF1_ACCESS_REQUIRED', 'OPENF1_AUTH_FAILED', 'OPENF1_CONFIGURATION'].includes(result.reason.code)) {
      throw result.reason;
    }
  }
}

export async function GET(request: Request) {
  const limited = enforcePublicRateLimit(request, 'telemetry');
  if (limited) return limited;

  try {
    const searchParams = new URL(request.url).searchParams;
    const seasonResult = parseSeasonParam(searchParams.get('season'));
    if (!seasonResult.ok) {
      return NextResponse.json({ error: seasonResult.error }, { status: 400 });
    }
    const season = seasonResult.value;
    const requestedDriver = searchParams.get('driver');
    const sessionKeyResult = parseSessionKeyParam(searchParams.get('sessionKey'));
    if (sessionKeyResult && !sessionKeyResult.ok) {
      return NextResponse.json({ error: sessionKeyResult.error }, { status: 400 });
    }
    const requestedSessionKey = sessionKeyResult?.ok ? String(sessionKeyResult.value) : null;

    let session: any = null;
    let rawDrivers: any[] = [];

    if (requestedSessionKey) {
      // Parallelize session metadata and driver list load
      const [sessionResult, driversResult] = await Promise.all([
        f1Api.sessions({ session_key: requestedSessionKey }),
        f1Api.drivers({ session_key: requestedSessionKey }),
      ]);
      session = Array.isArray(sessionResult.data) ? sessionResult.data[0] || null : null;
      rawDrivers = Array.isArray(driversResult.data) ? driversResult.data : [];
    } else {
      const sessionsResult = await f1Api.sessions({ year: season });
      const sessions = Array.isArray(sessionsResult.data) ? sessionsResult.data : [];
      session = selectPreferredSession(sessions, { preferRace: false, allowScheduledFallback: false });
      if (session?.session_key) {
        const driversResult = await f1Api.drivers({ session_key: session.session_key });
        rawDrivers = Array.isArray(driversResult.data) ? driversResult.data : [];
      }
    }

    if (!session?.session_key) {
      return NextResponse.json(normalizeTelemetryPayload({ session: null }));
    }

    const selectedDriver = selectTelemetryDriver(rawDrivers, requestedDriver);
    if (!selectedDriver) {
      return NextResponse.json(
        normalizeTelemetryPayload({
          session,
          drivers: rawDrivers,
          selectedDriver: null,
        })
      );
    }

    // Cache lookup: instantly return completed static sessions or recently fetched live sessions
    const cacheKey = `${session.session_key}-${selectedDriver.driverNumber}`;
    const cached = telemetryCache.get(cacheKey);
    const nowMs = Date.now();
    for (const [key, entry] of telemetryCache) {
      if (entry.expiresAt <= nowMs) telemetryCache.delete(key);
    }
    if (cached && cached.expiresAt > nowMs) {
      return NextResponse.json(cached.data, { headers: publicCacheHeaders(15, 0) });
    }

    const [lapsResult, positionsResult] = await Promise.allSettled([
      f1Api.laps({
        session_key: session.session_key,
        driver_number: selectedDriver.driverNumber,
      }),
      f1Api.positions({
        session_key: session.session_key,
        driver_number: selectedDriver.driverNumber,
      }),
    ]);
    rejectAccessFailure([lapsResult, positionsResult]);

    const laps =
      lapsResult.status === 'fulfilled' && Array.isArray(lapsResult.value.data)
        ? lapsResult.value.data
        : [];
    const positions =
      positionsResult.status === 'fulfilled' && Array.isArray(positionsResult.value.data)
        ? positionsResult.value.data
        : [];

    let carData: any[] = [];
    const telemetryWindowStart = getTelemetryWindowStart(laps);

    const carDataResult = await Promise.allSettled([
      f1Api.carDataWindow(session.session_key, selectedDriver.driverNumber, telemetryWindowStart ?? undefined),
    ]);
    rejectAccessFailure(carDataResult);

    if (
      carDataResult[0]?.status === 'fulfilled' &&
      Array.isArray(carDataResult[0].value.data)
    ) {
      carData = carDataResult[0].value.data;
    }

    const payload = normalizeTelemetryPayload({
      session,
      drivers: rawDrivers,
      selectedDriver,
      carData,
      laps,
      positions,
    });

    const results = [lapsResult, positionsResult, ...carDataResult];
    const healthy = results.every(result => result.status === 'fulfilled' && Array.isArray(result.value.data));
    const cacheable = healthy && payload.samples.length > 0;
    if (cacheable) {
      // Missing end times are uncertain. Recently finished feeds may still be populated.
      const endMs = Date.parse(session.date_end || '');
      const stableHistory = Number.isFinite(endMs) && endMs <= Date.now() - 30 * 60_000 && payload.source === 'car-data';
      const ttlMs = stableHistory ? 24 * 60 * 60_000 : LIVE_TTL_MS;
      if (telemetryCache.size >= MAX_CACHE_ENTRIES) telemetryCache.delete(telemetryCache.keys().next().value!);
      telemetryCache.set(cacheKey, { data: payload, expiresAt: Date.now() + ttlMs });
    }

    return NextResponse.json(payload, {
      headers: cacheable ? publicCacheHeaders(15, 0) : { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof OpenF1Error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Telemetry API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch telemetry data' },
      { status: 500 }
    );
  }
}
