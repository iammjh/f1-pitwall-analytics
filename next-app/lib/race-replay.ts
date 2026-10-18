import type { RaceStory } from '@/lib/race-story';

export type CarStatus = 'racing' | 'finished' | 'retired';

export interface ReplayCar {
  id: string;
  /** 1-based running order at this moment. */
  position: number;
  /** Laps covered so far, e.g. 3.42 is 42% into the fourth lap. Finished cars sit at the total. */
  distance: number;
  /** Position around the lap loop, 0 to 1 (the start/finish line is 0). */
  loopFraction: number;
  /** Seconds behind the car in front at this moment, measured when this car reached its current distance. */
  gapToLeaderSec: number;
  /** Whole laps the car is behind the leader. */
  lapsDown: number;
  status: CarStatus;
}

export interface Replay {
  /** Laps in the race, from the lap list. */
  laps: number;
  /** Race time of the last timed lap end, in seconds. */
  durationSec: number;
  /** Driver id -> cumulative time at the end of each completed lap, up to the point the driver stopped timing. */
  endTimes: Record<string, number[]>;
}

/** Cumulative lap ends for one driver: the prefix of timed laps (a driver stops timing when they retire). */
function timedPrefix(times: (number | null)[] | undefined): number[] {
  const ends: number[] = [];
  for (const value of times ?? []) {
    if (value === null || value === undefined) break;
    ends.push(value);
  }
  return ends;
}

export function buildReplay(story: RaceStory): Replay {
  const endTimes: Record<string, number[]> = {};
  for (const id of Object.keys(story.times ?? {})) endTimes[id] = timedPrefix(story.times[id]);
  const durationSec = Math.max(0, ...Object.values(endTimes).map((ends) => ends[ends.length - 1] ?? 0));
  return { laps: story.laps.length, durationSec, endTimes };
}

/** Race time at which the leader reached a given distance in laps, interpolating within a lap. */
function leaderTimeAt(ends: number[], distance: number): number {
  if (distance <= 0 || !ends.length) return 0;
  const whole = Math.floor(distance);
  const fraction = distance - whole;
  const previous = whole > 0 ? ends[Math.min(whole, ends.length) - 1] : 0;
  const next = ends[Math.min(whole, ends.length - 1)] ?? previous;
  return previous + fraction * (next - previous);
}

interface DriverState {
  id: string;
  distance: number;
  status: CarStatus;
  arrival: number;
}

/** Where each driver is at race time t, with running order and gaps. */
export function carsAt(replay: Replay, t: number): { cars: ReplayCar[]; leaderLap: number } {
  const states: DriverState[] = Object.entries(replay.endTimes)
    .filter(([, ends]) => ends.length > 0)
    .map(([id, ends]) => {
      const finished = ends.length >= replay.laps;
      const completed = ends.filter((end) => end <= t).length;
      if (completed >= ends.length) {
        // Stopped timing: finished cars sit at the flag, retired cars at the end of their last timed lap.
        const status: CarStatus = finished ? 'finished' : 'retired';
        return { id, distance: ends.length, status, arrival: ends[ends.length - 1] };
      }
      const start = completed > 0 ? ends[completed - 1] : 0;
      const end = ends[completed];
      const progress = end > start ? Math.min(1, Math.max(0, (t - start) / (end - start))) : 0;
      return { id, distance: completed + progress, status: 'racing' as CarStatus, arrival: start };
    });

  // Running order: furthest first; cars level on distance are ordered by who got there first.
  states.sort((a, b) => b.distance - a.distance || a.arrival - b.arrival || a.id.localeCompare(b.id));
  const leader = states[0];
  const leaderEnds = leader ? replay.endTimes[leader.id] : [];
  const cars: ReplayCar[] = states.map((state, index) => {
    const gapToLeaderSec = index === 0 ? 0 : Math.max(0, t - leaderTimeAt(leaderEnds, state.distance));
    const lapsDown = leader ? Math.floor(leader.distance) - Math.floor(state.distance) : 0;
    return {
      id: state.id,
      position: index + 1,
      distance: state.distance,
      loopFraction: state.distance - Math.floor(state.distance),
      gapToLeaderSec,
      lapsDown: Math.max(0, lapsDown),
      status: state.status,
    };
  });
  const leaderLap = leader ? (leader.status === 'finished' ? replay.laps : Math.min(replay.laps, Math.floor(leader.distance) + 1)) : 0;
  return { cars, leaderLap };
}
