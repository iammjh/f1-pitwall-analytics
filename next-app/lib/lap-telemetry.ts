/** One OpenF1 car_data row (only the fields used here). */
export interface CarDataRow {
  date: string;
  speed?: number;
  throttle?: number;
  brake?: number;
  n_gear?: number;
  rpm?: number;
  drs?: number;
}

/** A car sample placed by its progress through the lap (0 = start, 1 = finish). */
export interface LapSample {
  p: number;
  speed: number;
  throttle: number;
  brake: number;
  gear: number;
  rpm: number;
  /** null when the feed has no DRS value for the sample (the 2026 feed does not report it). */
  drs: boolean | null;
}

/** DRS values 10, 12 and 14 mean the flap is open (OpenF1). */
const DRS_OPEN = new Set([10, 12, 14]);

/**
 * Places car samples on a lap. Progress is the sample's share of the lap time, which is an estimate of
 * track position (OpenF1 GPS positions are not mapped onto the traced track outline).
 */
export function placeSamplesOnLap(rows: CarDataRow[], lapStartMs: number, lapDurationSec: number): LapSample[] {
  if (!(lapDurationSec > 0)) return [];
  const durationMs = lapDurationSec * 1000;
  const samples: LapSample[] = [];
  for (const row of rows) {
    const t = Date.parse(row.date);
    if (Number.isNaN(t)) continue;
    const p = (t - lapStartMs) / durationMs;
    if (p < 0 || p > 1) continue;
    samples.push({
      p,
      speed: Number(row.speed ?? 0),
      throttle: Number(row.throttle ?? 0),
      brake: row.brake ? 100 : 0,
      gear: Number(row.n_gear ?? 0),
      rpm: Number(row.rpm ?? 0),
      drs: row.drs == null ? null : DRS_OPEN.has(Number(row.drs)),
    });
  }
  return samples.sort((a, b) => a.p - b.p);
}

/** The sample nearest to a lap progress value (0..1), or null when there are no samples. */
export function sampleAtProgress(samples: LapSample[], progress: number): LapSample | null {
  if (!samples.length) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].p < progress) lo = mid + 1;
    else hi = mid;
  }
  const after = samples[lo];
  const before = lo > 0 ? samples[lo - 1] : after;
  return Math.abs(before.p - progress) <= Math.abs(after.p - progress) ? before : after;
}

function pctDrs(samples: LapSample[]): string {
  const known = samples.filter((s) => s.drs !== null);
  if (!known.length) return 'n/a';
  return ((known.filter((s) => s.drs).length / known.length) * 100).toFixed(2);
}

/** Lap averages in the same shape the visualizer's comparison cards use. */
export function summarizeLapSamples(samples: LapSample[]) {
  if (!samples.length) return null;
  const n = samples.length;
  const mean = (pick: (s: LapSample) => number) => samples.reduce((sum, s) => sum + pick(s), 0) / n;
  return {
    avgSpeed: mean((s) => s.speed).toFixed(2),
    avgThrottle: mean((s) => s.throttle).toFixed(2),
    pctBraking: ((samples.filter((s) => s.brake > 0).length / n) * 100).toFixed(2),
    pctDrs: pctDrs(samples),
    avgGear: mean((s) => s.gear).toFixed(2),
  };
}
