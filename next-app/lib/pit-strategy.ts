/** A tyre stint from OpenF1. The stop sits at the lap where one stint ends and the next starts. */
export interface Stint {
  stintNumber: number;
  compound: string;
  lapStart: number;
  lapEnd: number;
  tyreAgeAtStart: number;
}

export interface LapRow {
  lap: number;
  durationSec: number | null;
  pitOut: boolean;
}

export interface PlannedStop {
  lap: number; // the last lap on the old tyres
  compound: string;
}

export interface TyreModel {
  baseDrySec: number;
  offsetByCompound: Record<string, number>;
  slopeByCompound: Record<string, number>;
  pitLossSec: number;
  totalLaps: number;
  samplesByCompound: Record<string, number>;
}

/** Fuel burn makes the car about this much faster per lap, so early laps are slower (seconds per lap). */
export const FUEL_EFFECT_SEC_PER_LAP = 0.03;
export const DEFAULT_PIT_LOSS_SEC = 22;
export const DEFAULT_SLOPE_SEC_PER_LAP = 0.05;
const MIN_SAMPLES_FOR_FIT = 5;
const PIT_LOSS_RANGE: [number, number] = [10, 40];

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Stint ages and laps that are representative of normal running: not pit or stint-boundary laps, not slow laps. */
function cleanLaps(laps: LapRow[], stints: Stint[]) {
  const total = laps.reduce((max, l) => Math.max(max, l.lap), 0);
  const durations = laps.filter((l) => l.durationSec !== null).map((l) => l.durationSec as number);
  const typical = median(durations) ?? 0;
  const out: { lap: number; durationSec: number; compound: string; tyreAge: number }[] = [];

  for (const stint of stints) {
    for (const row of laps) {
      if (row.lap <= stint.lapStart || row.lap >= stint.lapEnd) continue; // boundary laps include pit work
      if (row.pitOut || row.durationSec === null) continue;
      if (typical && row.durationSec > typical * 1.07) continue; // safety car, incidents, traffic
      out.push({
        lap: row.lap,
        durationSec: row.durationSec,
        compound: stint.compound,
        tyreAge: stint.tyreAgeAtStart + (row.lap - stint.lapStart),
      });
    }
  }
  return { rows: out, totalLaps: total };
}

/** Least-squares slope of y on x. */
function slope(points: { x: number; y: number }[]): number {
  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Pit loss: how much slower the out-lap is than a normal lap, from the race itself. */
export function estimatePitLoss(laps: LapRow[]): number {
  const typical = median(laps.filter((l) => !l.pitOut && l.durationSec !== null).map((l) => l.durationSec as number));
  const outLaps = laps.filter((l) => l.pitOut && l.durationSec !== null).map((l) => (l.durationSec as number) - (typical ?? 0));
  const loss = median(outLaps);
  if (loss === null) return DEFAULT_PIT_LOSS_SEC;
  return Math.min(PIT_LOSS_RANGE[1], Math.max(PIT_LOSS_RANGE[0], loss));
}

/**
 * Fits the tyre model from one race: wear per lap of tyre age for each compound, and how each compound's
 * pace compares with the rest. Lap times are first corrected for fuel so wear is not confused with it.
 */
export function fitTyreModel(laps: LapRow[], stints: Stint[]): TyreModel {
  const { rows, totalLaps } = cleanLaps(laps, stints);
  const adjusted = rows.map((r) => ({ ...r, dry: r.durationSec - FUEL_EFFECT_SEC_PER_LAP * (totalLaps - r.lap) }));
  const baseDrySec = median(adjusted.map((r) => r.dry)) ?? 0;

  const compounds = [...new Set(stints.map((s) => s.compound))];
  const offsetByCompound: Record<string, number> = {};
  const slopeByCompound: Record<string, number> = {};
  const samplesByCompound: Record<string, number> = {};

  for (const compound of compounds) {
    const own = adjusted.filter((r) => r.compound === compound);
    const compoundMedian = median(own.map((r) => r.dry)) ?? baseDrySec;
    samplesByCompound[compound] = own.length;
    offsetByCompound[compound] = compoundMedian - baseDrySec;
    slopeByCompound[compound] =
      own.length >= MIN_SAMPLES_FOR_FIT
        ? Math.max(0, slope(own.map((r) => ({ x: r.tyreAge, y: r.dry - compoundMedian })))) // tyres never get faster with age
        : DEFAULT_SLOPE_SEC_PER_LAP;
  }

  return {
    baseDrySec,
    offsetByCompound,
    slopeByCompound,
    pitLossSec: estimatePitLoss(laps),
    totalLaps,
    samplesByCompound,
  };
}

export interface SimulatedLap {
  lap: number;
  sec: number;
  compound: string;
  tyreAge: number;
  pit: boolean;
}

/** Lap-by-lap race for a set of stops. The pit loss is added once to each stop lap. */
export function simulateStrategy(
  model: TyreModel,
  start: { compound: string; tyreAgeAtStart: number },
  stops: PlannedStop[],
): { totalSec: number; laps: SimulatedLap[] } {
  const ordered = [...stops].sort((a, b) => a.lap - b.lap);
  const laps: SimulatedLap[] = [];
  let compound = start.compound;
  let tyreAge = start.tyreAgeAtStart;

  for (let lap = 1; lap <= model.totalLaps; lap++) {
    const offset = model.offsetByCompound[compound] ?? 0;
    const wear = (model.slopeByCompound[compound] ?? DEFAULT_SLOPE_SEC_PER_LAP) * tyreAge;
    const fuel = FUEL_EFFECT_SEC_PER_LAP * (model.totalLaps - lap);
    const pit = ordered.some((s) => s.lap === lap);
    const sec = model.baseDrySec + offset + wear + fuel + (pit ? model.pitLossSec : 0);
    laps.push({ lap, sec, compound, tyreAge, pit });

    tyreAge += 1;
    const stop = ordered.find((s) => s.lap === lap);
    if (stop) {
      compound = stop.compound;
      tyreAge = 0;
    }
  }
  return { totalSec: laps.reduce((sum, l) => sum + l.sec, 0), laps };
}

/** The stops a race actually made, as the planner's starting point. */
export function stopsFromStints(stints: Stint[]): PlannedStop[] {
  const ordered = [...stints].sort((a, b) => a.stintNumber - b.stintNumber);
  return ordered.slice(1).map((stint, i) => ({ lap: ordered[i].lapEnd, compound: stint.compound }));
}

export function startFromStints(stints: Stint[]) {
  const first = [...stints].sort((a, b) => a.stintNumber - b.stintNumber)[0];
  return first ? { compound: first.compound, tyreAgeAtStart: first.tyreAgeAtStart } : null;
}

export const MAX_PLANNED_STOPS = 4;

/** Keeps stops inside the race, one per lap, in running order. */
export function normaliseStops(stops: PlannedStop[], totalLaps: number): PlannedStop[] {
  const byLap = new Map<number, PlannedStop>();
  for (const stop of stops) {
    if (stop.lap >= 1 && stop.lap <= totalLaps - 1) byLap.set(stop.lap, stop);
  }
  return [...byLap.values()].sort((a, b) => a.lap - b.lap).slice(0, MAX_PLANNED_STOPS);
}

/** Stint segments for a starting compound and a set of stops: each segment runs to the lap of its stop. */
export function segmentsFor(
  start: { compound: string },
  stops: PlannedStop[],
  totalLaps: number,
): { compound: string; laps: number }[] {
  const segments: { compound: string; laps: number }[] = [];
  let from = 1;
  let compound = start.compound;
  for (const stop of stops) {
    segments.push({ compound, laps: stop.lap - from + 1 });
    from = stop.lap + 1;
    compound = stop.compound;
  }
  segments.push({ compound, laps: totalLaps - from + 1 });
  return segments;
}

