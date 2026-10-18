import { describe, expect, it } from 'vitest';
import {
  brierScore,
  buildFeatureRows,
  effectiveGrid,
  evaluatePodiumModel,
  fitLogistic,
  logLoss,
  predictLogistic,
  toRaceRecord,
  type RaceRecord,
} from '@/lib/podium-model';

const race = (round: number, rows: RaceRecord['rows'], date = `2025-03-${String(round).padStart(2, '0')}`): RaceRecord => ({
  season: 2025,
  round,
  date,
  rows,
});

describe('buildFeatureRows', () => {
  it('uses only earlier races for form, never the race being predicted', () => {
    const races = [
      race(1, [{ driverId: 'a', constructorId: 'x', grid: 1, finish: 1, points: 25 }]),
      race(2, [{ driverId: 'a', constructorId: 'x', grid: 2, finish: 5, points: 10 }]),
    ];
    const rows = buildFeatureRows(races);
    expect(rows[0].formAvg).toBe(10.5); // no history before round 1
    expect(rows[1].formAvg).toBe(1); // only round 1 counts when predicting round 2
  });

  it('treats the pit lane as the back of the grid and a non-finish as 20th', () => {
    expect(effectiveGrid(0)).toBe(20);
    expect(effectiveGrid(3)).toBe(3);
    const rows = buildFeatureRows([
      race(1, [{ driverId: 'a', constructorId: 'x', grid: 0, finish: null, points: 0 }]),
      race(2, [{ driverId: 'a', constructorId: 'x', grid: 4, finish: 2, points: 18 }]),
    ]);
    expect(rows[0].grid).toBe(20);
    expect(rows[1].formAvg).toBe(20);
  });

  it('marks podium finishes and sorts by date before building history', () => {
    const rows = buildFeatureRows([
      race(2, [{ driverId: 'a', constructorId: 'x', grid: 1, finish: 2, points: 18 }], '2025-04-01'),
      race(1, [{ driverId: 'a', constructorId: 'x', grid: 1, finish: 3, points: 15 }], '2025-03-01'),
    ]);
    expect(rows.map((r) => r.round)).toEqual([1, 2]);
    expect(rows.map((r) => r.podium)).toEqual([1, 1]);
    expect(rows[1].formAvg).toBe(3);
  });
});

describe('fitLogistic', () => {
  it('learns that a better grid slot means a higher podium chance', () => {
    // Deterministic data: front-row starters land on the podium more often than the back of the grid.
    const X: number[][] = [];
    const y: number[] = [];
    for (let rep = 0; rep < 40; rep++) {
      for (const grid of [1, 2, 3, 8, 12, 18]) {
        X.push([grid]);
        const onPodium = grid <= 3 ? rep % 4 !== 0 : rep % 8 === 0;
        y.push(onPodium ? 1 : 0);
      }
    }
    const model = fitLogistic(X, y);
    expect(model.weights[0]).toBeLessThan(0);
    expect(predictLogistic(model, [1])).toBeGreaterThan(predictLogistic(model, [18]));
  });

  it('returns probabilities strictly between 0 and 1', () => {
    const model = fitLogistic([[1], [2], [10], [20]], [1, 1, 0, 0]);
    for (const grid of [1, 5, 20, 50]) {
      const p = predictLogistic(model, [grid]);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });
});

describe('scoring', () => {
  it('scores perfect predictions as zero Brier and near-zero log loss', () => {
    expect(brierScore([1, 0], [1, 0])).toBe(0);
    expect(logLoss([1, 0], [1, 0])).toBeLessThan(1e-10);
  });

  it('scores a constant 50% guess as 0.25 Brier', () => {
    expect(brierScore([0.5, 0.5, 0.5, 0.5], [1, 0, 1, 0])).toBeCloseTo(0.25, 10);
  });
});

describe('evaluatePodiumModel', () => {
  it('reports the model next to the grid-only and base-rate baselines on held-out rows', () => {
    const rows = buildFeatureRows(
      Array.from({ length: 8 }, (_, i) =>
        race(i + 1, [
          { driverId: 'a', constructorId: 'x', grid: 1, finish: 1, points: 25 },
          { driverId: 'b', constructorId: 'y', grid: 2, finish: 2, points: 18 },
          { driverId: 'c', constructorId: 'z', grid: 3, finish: 3, points: 15 },
          { driverId: 'd', constructorId: 'w', grid: 4, finish: 4, points: 12 },
          { driverId: 'e', constructorId: 'v', grid: 5, finish: 5, points: 10 },
        ]),
      ),
    );
    const { evaluation } = evaluatePodiumModel(rows.slice(0, 30), rows.slice(30));
    expect(evaluation.testRows).toBe(10);
    expect(evaluation.baseRate).toBeGreaterThan(0);
    expect(evaluation.brier.gridOnly).toBeLessThan(evaluation.brier.baseRate);
    expect(evaluation.brier.withFormAndTeam).toBeLessThan(evaluation.brier.baseRate);
  });
});

describe('toRaceRecord', () => {
  it('reads classified finishes and treats non-numeric positions as non-finishes', () => {
    const record = toRaceRecord(
      {
        round: '3',
        date: '2025-03-16',
        time: '15:00:00Z',
        Results: [
          { Driver: { driverId: 'a' }, Constructor: { constructorId: 'x' }, grid: '2', position: '1', positionText: '1', points: '25' },
          { Driver: { driverId: 'b' }, Constructor: { constructorId: 'y' }, grid: '0', position: '20', positionText: 'R', points: '0' },
        ],
      },
      2025,
    );
    expect(record.season).toBe(2025);
    expect(record.round).toBe(3);
    expect(record.rows[0]).toEqual({ driverId: 'a', constructorId: 'x', grid: 2, finish: 1, points: 25 });
    expect(record.rows[1].finish).toBeNull();
  });
});
