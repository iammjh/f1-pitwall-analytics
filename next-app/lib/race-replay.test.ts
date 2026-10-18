import { describe, expect, it } from 'vitest';
import { buildReplay, carsAt, type Replay } from '@/lib/race-replay';
import type { RaceStory } from '@/lib/race-story';

const story = (times: Record<string, (number | null)[]>, laps = 3): RaceStory => ({
  laps: Array.from({ length: laps }, (_, i) => i + 1),
  positions: {},
  gaps: {},
  times,
  drivers: Object.keys(times),
});

const replay = (): Replay => buildReplay(story({
  alpha: [90, 180, 270],
  beta: [95, 190, 285],
}));

describe('buildReplay', () => {
  it('takes the race length from the lap list and the duration from the last lap end', () => {
    const built = replay();
    expect(built.laps).toBe(3);
    expect(built.durationSec).toBe(285);
  });

  it('keeps only the timed prefix for a driver who stops timing', () => {
    const built = buildReplay(story({ gamma: [100, 200, null] }));
    expect(built.endTimes.gamma).toEqual([100, 200]);
  });
});

describe('carsAt', () => {
  it('places each car part-way through its current lap', () => {
    const { cars } = carsAt(replay(), 45);
    const alpha = cars.find((c) => c.id === 'alpha')!;
    expect(alpha.distance).toBeCloseTo(0.5, 6);
    expect(alpha.loopFraction).toBeCloseTo(0.5, 6);
    expect(alpha.position).toBe(1);
    expect(alpha.status).toBe('racing');
  });

  it('orders cars by distance and reports the leader lap', () => {
    const { cars, leaderLap } = carsAt(replay(), 100);
    expect(cars.map((c) => c.id)).toEqual(['alpha', 'beta']);
    expect(leaderLap).toBe(2);
  });

  it('measures the gap when the car reached its current distance', () => {
    // At 190 s beta has just finished lap 2, a point alpha reached at 180 s.
    const { cars } = carsAt(replay(), 190);
    const beta = cars.find((c) => c.id === 'beta')!;
    expect(beta.gapToLeaderSec).toBeCloseTo(10, 6);
    expect(cars[0].gapToLeaderSec).toBe(0);
  });

  it('marks finished cars and keeps the order they crossed the line', () => {
    const { cars } = carsAt(replay(), 300);
    expect(cars.map((c) => [c.id, c.status])).toEqual([['alpha', 'finished'], ['beta', 'finished']]);
    expect(cars[0].distance).toBe(3);
  });

  it('parks a retired car at the end of its last timed lap and counts laps down', () => {
    const built = buildReplay(story({ alpha: [90, 180, 270], gamma: [100, 200, null] }));
    const { cars } = carsAt(built, 300);
    const gamma = cars.find((c) => c.id === 'gamma')!;
    expect(gamma.status).toBe('retired');
    expect(gamma.distance).toBe(2);
    expect(gamma.lapsDown).toBe(1);
  });

  it('returns no cars before any timing exists', () => {
    expect(carsAt(buildReplay(story({})), 0).cars).toEqual([]);
  });
});
