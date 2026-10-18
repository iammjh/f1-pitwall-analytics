export interface LapTiming {
  driverId: string;
  time: string;
  position: string;
}

export interface RaceLapEntry {
  number: string;
  Timings: LapTiming[];
}

export interface RaceLap {
  number: number;
  timings: LapTiming[];
}

export interface RaceStory {
  /** Lap numbers, in order. Every series below is indexed the same way. */
  laps: number[];
  /** Position at the end of each lap, per driver (null when the driver has no timing for that lap). */
  positions: Record<string, (number | null)[]>;
  /** Cumulative race time behind the leader, in seconds, per driver (null once a driver stops timing). */
  gaps: Record<string, (number | null)[]>;
  /** Cumulative race time in seconds at the end of each lap, per driver (null once a driver stops timing). */
  times: Record<string, (number | null)[]>;
  /** Driver IDs ordered by their last recorded position, best first. */
  drivers: string[];
}

/** Jolpica pages laps by timing entry, so one lap can arrive across several pages. Merge them by lap number. */
export function collectLaps(pages: RaceLapEntry[][]): RaceLap[] {
  const byNumber = new Map<number, LapTiming[]>();
  for (const page of pages) {
    for (const lap of page) {
      const number = Number(lap.number);
      if (!Number.isInteger(number)) continue;
      byNumber.set(number, [...(byNumber.get(number) ?? []), ...(lap.Timings ?? [])]);
    }
  }
  return [...byNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, timings]) => ({ number, timings }));
}

/** "1:23.456" or "83.456" as seconds, or null when it is not a lap time. */
export function parseLapTime(value: string | undefined): number | null {
  const match = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec((value ?? '').trim());
  if (!match) return null;
  return Number(match[1] ?? 0) * 60 + Number(match[2]);
}

export function buildRaceStory(laps: RaceLap[]): RaceStory {
  const driverIds = [...new Set(laps.flatMap((lap) => lap.timings.map((t) => t.driverId)))];
  const positions: Record<string, (number | null)[]> = {};
  const cumulative: Record<string, (number | null)[]> = {};
  const running = new Map<string, number>();
  const stopped = new Set<string>();

  for (const id of driverIds) {
    positions[id] = [];
    cumulative[id] = [];
  }

  for (const lap of laps) {
    const timingById = new Map(lap.timings.map((t) => [t.driverId, t]));
    for (const id of driverIds) {
      const timing = timingById.get(id);
      const seconds = timing ? parseLapTime(timing.time) : null;
      if (seconds === null) stopped.add(id);
      else if (!stopped.has(id)) running.set(id, (running.get(id) ?? 0) + seconds);

      const position = timing ? Number(timing.position) : NaN;
      positions[id].push(Number.isInteger(position) ? position : null);
      cumulative[id].push(stopped.has(id) ? null : running.get(id) ?? null);
    }
  }

  // Gap to the leader is each driver's cumulative time minus the smallest cumulative time on that lap.
  const gaps: Record<string, (number | null)[]> = {};
  for (const id of driverIds) gaps[id] = [];
  laps.forEach((_, index) => {
    const times = driverIds.map((id) => cumulative[id][index]).filter((t): t is number => t !== null);
    const leader = times.length ? Math.min(...times) : null;
    for (const id of driverIds) {
      const time = cumulative[id][index];
      gaps[id].push(time !== null && leader !== null ? Math.round((time - leader) * 1000) / 1000 : null);
    }
  });

  const lastPosition = (id: string) => [...positions[id]].reverse().find((p) => p !== null) ?? Number.POSITIVE_INFINITY;
  const drivers = [...driverIds].sort((a, b) => lastPosition(a) - lastPosition(b));

  return { laps: laps.map((lap) => lap.number), positions, gaps, times: cumulative, drivers };
}
