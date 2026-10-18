import { describe, expect, it } from 'vitest';
import {
  estimatePitLoss,
  fitTyreModel,
  MAX_PLANNED_STOPS,
  normaliseStops,
  segmentsFor,
  simulateStrategy,
  startFromStints,
  stopsFromStints,
  type LapRow,
  type Stint,
  type TyreModel,
} from '@/lib/pit-strategy';

const model = (over: Partial<TyreModel> = {}): TyreModel => ({
  baseDrySec: 90,
  offsetByCompound: { SOFT: 0, HARD: 0.5 },
  slopeByCompound: { SOFT: 0.1, HARD: 0.1 },
  pitLossSec: 20,
  totalLaps: 40,
  samplesByCompound: {},
  ...over,
});

describe('simulateStrategy', () => {
  it('adds the pit loss once for each stop when tyres do not matter', () => {
    const flat = model({ slopeByCompound: { SOFT: 0, HARD: 0 } });
    const none = simulateStrategy(flat, { compound: 'SOFT', tyreAgeAtStart: 0 }, []);
    const oneStop = simulateStrategy(flat, { compound: 'SOFT', tyreAgeAtStart: 0 }, [{ lap: 20, compound: 'HARD' }]);
    expect(oneStop.totalSec - none.totalSec).toBeCloseTo(20 + 0.5 * 20, 6); // pit loss plus the HARD offset for the 20 laps on it
  });

  it('makes a fresh-tyre stop faster than staying out when wear is high', () => {
    const worn = model({ slopeByCompound: { SOFT: 0.5, HARD: 0.5 }, offsetByCompound: { SOFT: 0, HARD: 0 } });
    const stayOut = simulateStrategy(worn, { compound: 'SOFT', tyreAgeAtStart: 0 }, []);
    const stopMid = simulateStrategy(worn, { compound: 'SOFT', tyreAgeAtStart: 0 }, [{ lap: 20, compound: 'SOFT' }]);
    expect(stopMid.totalSec).toBeLessThan(stayOut.totalSec);
  });

  it('marks pit laps and resets tyre age after a stop', () => {
    const run = simulateStrategy(model(), { compound: 'SOFT', tyreAgeAtStart: 0 }, [{ lap: 10, compound: 'HARD' }]);
    expect(run.laps.find((l) => l.pit)?.lap).toBe(10);
    expect(run.laps.find((l) => l.lap === 11)).toMatchObject({ compound: 'HARD', tyreAge: 0 });
  });
});

describe('fitTyreModel', () => {
  // A 30-lap stint on one compound, wearing 0.12 s per lap of tyre age, with fuel burn of 0.03 s per lap.
  const totalLaps = 30;
  const stint: Stint = { stintNumber: 1, compound: 'MEDIUM', lapStart: 0, lapEnd: totalLaps + 1, tyreAgeAtStart: 0 };
  const laps: LapRow[] = Array.from({ length: totalLaps }, (_, i) => {
    const lap = i + 1;
    return { lap, durationSec: 90 + 0.12 * lap + 0.03 * (totalLaps - lap), pitOut: false };
  });

  it('recovers the wear rate for a compound from clean laps', () => {
    const fitted = fitTyreModel(laps, [stint]);
    expect(fitted.slopeByCompound.MEDIUM).toBeCloseTo(0.12, 3);
    expect(fitted.totalLaps).toBe(totalLaps);
  });

  it('falls back to the default wear rate when a compound has too few laps', () => {
    const fitted = fitTyreModel(laps.slice(0, 3), [stint]);
    expect(fitted.slopeByCompound.MEDIUM).toBe(0.05);
  });
});

describe('estimatePitLoss', () => {
  it('reads the pit loss from the out-lap against a normal lap', () => {
    const laps: LapRow[] = [
      { lap: 1, durationSec: 90, pitOut: false },
      { lap: 2, durationSec: 90, pitOut: false },
      { lap: 3, durationSec: 90, pitOut: false },
      { lap: 4, durationSec: 115, pitOut: true },
    ];
    expect(estimatePitLoss(laps)).toBe(25);
  });

  it('uses the default when there is no out-lap', () => {
    expect(estimatePitLoss([{ lap: 1, durationSec: 90, pitOut: false }])).toBe(22);
  });
});

describe('stints to plan', () => {
  const stints: Stint[] = [
    { stintNumber: 1, compound: 'SOFT', lapStart: 1, lapEnd: 15, tyreAgeAtStart: 0 },
    { stintNumber: 2, compound: 'HARD', lapStart: 15, lapEnd: 40, tyreAgeAtStart: 0 },
  ];

  it('turns the actual stops into a planner starting point', () => {
    expect(startFromStints(stints)).toEqual({ compound: 'SOFT', tyreAgeAtStart: 0 });
    expect(stopsFromStints(stints)).toEqual([{ lap: 15, compound: 'HARD' }]);
  });
});

describe('planner stops', () => {
  it('drops stops outside the race and keeps one stop per lap in running order', () => {
    const stops = normaliseStops(
      [{ lap: 30, compound: 'HARD' }, { lap: 0, compound: 'SOFT' }, { lap: 40, compound: 'SOFT' }, { lap: 12, compound: 'SOFT' }, { lap: 12, compound: 'MEDIUM' }],
      40,
    );
    expect(stops).toEqual([{ lap: 12, compound: 'MEDIUM' }, { lap: 30, compound: 'HARD' }]);
  });

  it('caps the number of planned stops', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ lap: 5 + i * 5, compound: 'SOFT' }));
    expect(normaliseStops(many, 60)).toHaveLength(MAX_PLANNED_STOPS);
  });

  it('splits the race into stints that add up to the total laps', () => {
    const segments = segmentsFor({ compound: 'SOFT' }, [{ lap: 15, compound: 'HARD' }, { lap: 40, compound: 'MEDIUM' }], 57);
    expect(segments).toEqual([
      { compound: 'SOFT', laps: 15 },
      { compound: 'HARD', laps: 25 },
      { compound: 'MEDIUM', laps: 17 },
    ]);
    expect(segments.reduce((sum, s) => sum + s.laps, 0)).toBe(57);
  });
});
