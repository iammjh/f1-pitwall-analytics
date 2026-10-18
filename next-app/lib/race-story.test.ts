import { describe, expect, it } from 'vitest';
import { buildRaceStory, collectLaps, parseLapTime, type RaceLapEntry } from '@/lib/race-story';

const lap = (number: number, timings: [string, string, string][]) => ({
  number: String(number),
  Timings: timings.map(([driverId, time, position]) => ({ driverId, time, position })),
});

describe('parseLapTime', () => {
  it('reads minute and second lap times', () => {
    expect(parseLapTime('1:23.456')).toBeCloseTo(83.456, 3);
    expect(parseLapTime('83.5')).toBe(83.5);
  });

  it('returns null for missing or invalid values', () => {
    expect(parseLapTime(undefined)).toBeNull();
    expect(parseLapTime('pit')).toBeNull();
  });
});

describe('collectLaps', () => {
  it('merges timings for the same lap across pages and sorts by lap number', () => {
    const pages: RaceLapEntry[][] = [
      [lap(2, [['a', '1:30.000', '1']])],
      [lap(1, [['a', '1:31.000', '1']]), lap(2, [['b', '1:32.000', '2']])],
    ];
    const laps = collectLaps(pages);
    expect(laps.map((l) => l.number)).toEqual([1, 2]);
    expect(laps[1].timings.map((t) => t.driverId)).toEqual(['a', 'b']);
  });
});

describe('buildRaceStory', () => {
  const laps = collectLaps([[
    lap(1, [['alpha', '1:30.000', '1'], ['beta', '1:31.000', '2']]),
    lap(2, [['beta', '1:30.000', '2'], ['alpha', '1:32.000', '1']]),
    lap(3, [['alpha', '1:30.000', '1'], ['beta', '1:30.500', '2']]),
  ]]);

  it('lists positions per lap and orders drivers by their last position', () => {
    const story = buildRaceStory(laps);
    expect(story.laps).toEqual([1, 2, 3]);
    expect(story.positions.alpha).toEqual([1, 1, 1]);
    expect(story.positions.beta).toEqual([2, 2, 2]);
    expect(story.drivers).toEqual(['alpha', 'beta']);
  });

  it('measures cumulative gap to the leader lap by lap', () => {
    const story = buildRaceStory(laps);
    // alpha: 90, 182, 272; beta: 91, 181, 271.5. The leader on each lap is the smaller total.
    expect(story.gaps.alpha).toEqual([0, 1, 0.5]);
    expect(story.gaps.beta).toEqual([1, 0, 0]);
  });

  it('stops gaps for a driver who stops timing laps', () => {
    const stopped = collectLaps([[
      lap(1, [['alpha', '1:30.000', '1'], ['beta', '1:31.000', '2']]),
      lap(2, [['alpha', '1:30.000', '1']]),
    ]]);
    const story = buildRaceStory(stopped);
    expect(story.gaps.beta).toEqual([1, null]);
    expect(story.positions.beta).toEqual([2, null]);
  });

  it('returns an empty story without laps', () => {
    expect(buildRaceStory([])).toEqual({ laps: [], positions: {}, gaps: {}, times: {}, drivers: [] });
  });
});
