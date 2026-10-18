import { describe, expect, it } from 'vitest';
import {
  buildDriverSeasonMetrics,
  getFinishPosition,
  getResultLabel,
  getResultTone,
} from '@/lib/driver-season-metrics';

const driver = { driverId: 'test_driver', givenName: 'Test', familyName: 'Driver' };

function race(round: number, position: string | null, status: string) {
  return {
    round: String(round),
    raceName: `Round ${round} Grand Prix`,
    Results: [{ Driver: driver, position, status, points: '0' }],
  };
}

describe('driver season metrics', () => {
  it('does not count a numeric retirement classification as a race finish', () => {
    const [metric] = buildDriverSeasonMetrics([], [race(1, '18', 'Engine')]);

    expect(metric).toMatchObject({
      races: 1,
      dnfs: 1,
      finishedRaces: 0,
      finishRate: 0,
      averageFinish: 18,
      bestFinish: 18,
    });
    expect(metric.lastResult).toMatchObject({
      finishPosition: 18,
      label: 'DNF',
      tone: '#E10600',
    });
  });

  it('counts lapped finishes while keeping classifications in result statistics', () => {
    const [metric] = buildDriverSeasonMetrics([], [
      race(3, '12', '+1 Lap'),
      race(1, '4', 'Finished'),
      race(2, '10', 'Gearbox'),
    ]);

    expect(metric).toMatchObject({
      races: 3,
      dnfs: 1,
      finishedRaces: 2,
      finishRate: 67,
      classifiedResults: 3,
      averageFinish: 8.7,
      bestFinish: 4,
      top10: 2,
      top10Rate: 67,
    });
    expect(metric.roundResults.map((result: { label: string }) => result.label)).toEqual([
      'P4', 'DNF', 'P12',
    ]);
  });

  it('handles missing classifications without inventing a podium or P0', () => {
    const [metric] = buildDriverSeasonMetrics([], [race(1, null, 'Finished')]);

    expect(metric).toMatchObject({
      finishedRaces: 1,
      finishRate: 100,
      averageFinish: null,
      bestFinish: null,
      podiums: 0,
      top10: 0,
    });
    expect(metric.lastResult.label).toBe('Finished');
    for (const position of [null, undefined, '', ' ', '0', '-1', '1.5', 'unknown']) {
      expect(getFinishPosition({ position })).toBeNull();
    }
  });

  it('prioritizes retirement labels and tones over classification colors', () => {
    expect(getResultLabel({ position: '3', status: 'Collision' })).toBe('DNF');
    expect(getResultTone({ position: '3', status: 'Collision' })).toBe('#E10600');
    expect(getResultLabel({ position: '3', status: 'Finished' })).toBe('P3');
    expect(getResultTone({ position: '3', status: 'Finished' })).toBe('#27F4D2');
  });
});
