import { describe, expect, it } from 'vitest';
import { buildPointsProgressionData, resolveHeadToHeadDrivers } from './championship-progression';

const standings = ['a', 'b'].map((driverId) => ({ Driver: { driverId, familyName: driverId }, points: '0' }));
const result = (driverId: string, points: string) => ({ Driver: { driverId }, points });

describe('championship points progression', () => {
  it('includes sprint points once in the same round and preserves race metrics inputs', () => {
    const races = [{ round: '1', Results: [result('a', '25'), result('b', '18')] }];
    const original = JSON.stringify(races);
    const sprints = [{ round: '1', SprintResults: [result('a', '8'), result('b', '7')] }];
    const chart = buildPointsProgressionData(standings, races, 6, sprints);
    expect(chart.data).toMatchObject([{ round: 1, a: 33, b: 25 }]);
    expect(JSON.stringify(races)).toBe(original);
  });

  it('carries totals across ordinary weekends and includes the current sprint before its GP', () => {
    const races = [
      { round: '2', Results: [result('b', '25'), result('a', '18')] },
      { round: '1', Results: [result('a', '25'), result('b', '18')] },
    ];
    const chart = buildPointsProgressionData(standings, races, 6, [
      { round: '3', SprintResults: [result('a', '8'), result('b', '7')] },
      { round: '1', SprintResults: [result('a', '3'), result('b', '2')] },
    ]);
    expect(chart.data).toMatchObject([
      { roundLabel: 'R1', a: 28, b: 20 },
      { roundLabel: 'R2', a: 46, b: 45 },
      { roundLabel: 'R3 Sprint', a: 54, b: 52 },
    ]);
  });

  it('supports seasons without sprints and fractional championship points', () => {
    const chart = buildPointsProgressionData(standings, [{ round: '1', Results: [result('a', '12.5')] }]);
    expect(chart.data).toMatchObject([{ a: 12.5, b: 0 }]);
    expect(buildPointsProgressionData([], [])).toEqual({ series: [], data: [] });
  });
});

describe('season-local head-to-head selections', () => {
  it('replaces selections for drivers absent from the next season', () => {
    expect(resolveHeadToHeadDrivers(['new-a', 'new-b'], 'old-a', 'old-b')).toEqual({ left: 'new-a', right: 'new-b' });
  });

  it('preserves valid shared selections and never compares a driver against themselves', () => {
    expect(resolveHeadToHeadDrivers(['a', 'b', 'c'], 'c', 'b')).toEqual({ left: 'c', right: 'b' });
    expect(resolveHeadToHeadDrivers(['a', 'b'], 'b', 'b')).toEqual({ left: 'b', right: 'a' });
    expect(resolveHeadToHeadDrivers(['a', 'b'], 'old', 'a')).toEqual({ left: 'a', right: 'b' });
  });

  it('handles empty or single-driver seasons without inventing an opponent', () => {
    expect(resolveHeadToHeadDrivers([])).toEqual({ left: '', right: '' });
    expect(resolveHeadToHeadDrivers(['a'], 'a', 'a')).toEqual({ left: 'a', right: '' });
  });
});
