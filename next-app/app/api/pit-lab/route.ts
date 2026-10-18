import { NextRequest, NextResponse } from 'next/server';
import { f1Api } from '@/lib/f1-api';
import { findRaceSession, type OpenF1Session } from '@/lib/openf1-session';
import {
  fitTyreModel,
  simulateStrategy,
  startFromStints,
  stopsFromStints,
  type LapRow,
  type Stint,
} from '@/lib/pit-strategy';
import { createTtlCache, enforcePublicRateLimit, publicCacheHeaders } from '@/lib/public-api';
import tyreWear from '@/lib/models/tyre-wear-by-circuit.json';
import type { CompoundWear } from '@/lib/tyre-wear';

export const dynamic = 'force-dynamic';

const FIRST_TELEMETRY_SEASON = 2023; // OpenF1 stints and lap timing start in 2023.
const CACHE_MS = 60 * 60 * 1000;
const labCache = createTtlCache<object>(CACHE_MS);

/**
 * The race's stints and laps for one driver, plus a tyre model fitted to that race. The client
 * replays the driver's real strategy and lets the user move the stops. The model is an estimate.
 */
export async function GET(req: NextRequest) {
  const limited = enforcePublicRateLimit(req, 'pit-lab');
  if (limited) return limited;

  const params = req.nextUrl.searchParams;
  const season = Number(params.get('season'));
  const date = params.get('date') ?? '';
  const code = (params.get('driver') ?? '').toUpperCase();
  const maxSeason = new Date().getFullYear() + 1;
  if (!Number.isInteger(season) || season < FIRST_TELEMETRY_SEASON || season > maxSeason) {
    return NextResponse.json({ error: `season must be between ${FIRST_TELEMETRY_SEASON} and ${maxSeason}.` }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD.' }, { status: 400 });
  }
  if (!/^[A-Z]{3}$/.test(code)) {
    return NextResponse.json({ error: 'driver must be a three-letter code.' }, { status: 400 });
  }

  const key = `${season}:${date}:${code}`;
  const cached = labCache.get(key);
  if (cached) return NextResponse.json(cached, { headers: publicCacheHeaders(CACHE_MS / 1000) });

  try {
    const sessionsRes = await f1Api.sessions({ year: season, session_name: 'Race' });
    const sessions = Array.isArray(sessionsRes.data) ? (sessionsRes.data as OpenF1Session[]) : [];
    const session = findRaceSession(sessions, date);
    if (!session) return NextResponse.json({ available: false, reason: 'race-session-not-found' });

    const driversRes = await f1Api.drivers({ session_key: session.session_key });
    const roster = (Array.isArray(driversRes.data) ? driversRes.data : [])
      .filter((d: any) => d?.name_acronym && d?.driver_number != null)
      .map((d: any) => ({
        code: String(d.name_acronym).toUpperCase(),
        driverNumber: Number(d.driver_number),
        name: d.full_name ?? String(d.name_acronym),
        team: d.team_name ?? null,
      }));
    const driver = roster.find((d) => d.code === code);
    if (!driver) return NextResponse.json({ available: false, reason: 'driver-not-in-session', roster });

    const [lapsRes, stintsRes] = await Promise.all([
      f1Api.laps({ session_key: session.session_key, driver_number: driver.driverNumber }),
      f1Api.stints({ session_key: session.session_key, driver_number: driver.driverNumber }),
    ]);
    const laps: LapRow[] = (Array.isArray(lapsRes.data) ? lapsRes.data : []).map((l: any) => ({
      lap: Number(l.lap_number),
      durationSec: l.lap_duration == null ? null : Number(l.lap_duration),
      pitOut: Boolean(l.is_pit_out_lap),
    }));
    const stints: Stint[] = (Array.isArray(stintsRes.data) ? stintsRes.data : []).map((s: any) => ({
      stintNumber: Number(s.stint_number),
      compound: String(s.compound ?? 'UNKNOWN').toUpperCase(),
      lapStart: Number(s.lap_start),
      lapEnd: Number(s.lap_end),
      tyreAgeAtStart: Number(s.tyre_age_at_start ?? 0),
    }));

    const start = startFromStints(stints);
    if (!start || laps.every((l) => l.durationSec === null)) {
      return NextResponse.json({ available: false, reason: 'no-lap-or-stint-data', roster });
    }

    const fitted = fitTyreModel(laps, stints);
    // A compound with too few clean laps in this race gets the wear rate measured at this circuit, when there is one.
    const circuitKey = String((session as OpenF1Session & { circuit_key?: number }).circuit_key ?? '');
    const circuitCompounds: Record<string, CompoundWear> =
      (tyreWear.circuits as unknown as Record<string, { compounds: Record<string, CompoundWear> }>)[circuitKey]?.compounds ?? {};
    const slopeSource: Record<string, 'race' | 'circuit' | 'default'> = {};
    for (const compound of Object.keys(fitted.samplesByCompound)) {
      // fitTyreModel only fits a slope from five clean laps; below that it falls back to a fixed default.
      if (fitted.samplesByCompound[compound] >= 5) {
        slopeSource[compound] = 'race';
      } else if (circuitCompounds[compound]) {
        fitted.slopeByCompound[compound] = circuitCompounds[compound].slopeSecPerLap;
        slopeSource[compound] = 'circuit';
      } else {
        slopeSource[compound] = 'default';
      }
    }
    const actualStops = stopsFromStints(stints);
    // Compare like with like: only laps that have a recorded time (lap 1 and retirements often do not).
    const timed = new Set(laps.filter((l) => l.durationSec !== null).map((l) => l.lap));
    const actualTotalSec = laps.reduce((sum, l) => sum + (l.durationSec ?? 0), 0);
    const timedTotal = (m: typeof fitted) =>
      simulateStrategy(m, start, actualStops).laps.filter((l) => timed.has(l.lap)).reduce((sum, l) => sum + l.sec, 0);

    // Shift the base pace so the model reproduces this driver's recorded race. Strategy comparisons use
    // differences only, so this calibration changes the level of the estimate, not the what-if deltas.
    const rawDiff = actualTotalSec - timedTotal(fitted);
    const calibrationShiftSec = Math.round((rawDiff / Math.max(1, timed.size)) * 1000) / 1000;
    const model = { ...fitted, baseDrySec: fitted.baseDrySec + calibrationShiftSec };
    const modelledTimedSec = timedTotal(model);
    // Compounds with few clean laps give a shaky wear rate; the client shows these as low confidence.
    const lowConfidence = Object.entries(model.samplesByCompound).filter(([, n]) => n < 10).map(([c]) => c);

    const payload = {
      available: true,
      session: { sessionKey: session.session_key, name: session.session_name, dateStart: session.date_start },
      driver,
      roster: roster.map(({ code: c, name, team }) => ({ code: c, name, team })),
      totalLaps: model.totalLaps,
      stints,
      start,
      actualStops,
      laps: laps.map((l) => ({ lap: l.lap, durationSec: l.durationSec, pitOut: l.pitOut })),
      model,
      actualTotalSec: Math.round(actualTotalSec * 1000) / 1000,
      modelledTotalSec: Math.round(modelledTimedSec * 1000) / 1000,
      calibrationShiftSec,
      lowConfidenceCompounds: lowConfidence,
      slopeSource,
      circuitWear: circuitCompounds,
    };
    labCache.set(key, payload);
    return NextResponse.json(payload, { headers: publicCacheHeaders(CACHE_MS / 1000) });
  } catch (error) {
    console.error('Pit lab error:', error);
    return NextResponse.json({ error: 'Could not load the pit lab data right now.' }, { status: 502 });
  }
}
