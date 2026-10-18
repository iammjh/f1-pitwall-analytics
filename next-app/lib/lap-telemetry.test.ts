import { describe, expect, it } from 'vitest';
import { placeSamplesOnLap, sampleAtProgress, summarizeLapSamples, type CarDataRow } from '@/lib/lap-telemetry';

const START = Date.parse('2025-03-16T15:00:00.000Z');
const row = (secondsIn: number, extra: Partial<CarDataRow> = {}): CarDataRow => ({
  date: new Date(START + secondsIn * 1000).toISOString(),
  speed: 200,
  throttle: 100,
  brake: 0,
  n_gear: 7,
  rpm: 11000,
  drs: 0,
  ...extra,
});

describe('placeSamplesOnLap', () => {
  it('places samples by their share of the lap time', () => {
    const samples = placeSamplesOnLap([row(0), row(45), row(90)], START, 90);
    expect(samples.map((s) => s.p)).toEqual([0, 0.5, 1]);
  });

  it('drops samples outside the lap window', () => {
    const samples = placeSamplesOnLap([row(-1), row(10), row(91)], START, 90);
    expect(samples).toHaveLength(1);
    expect(samples[0].p).toBeCloseTo(10 / 90);
  });

  it('maps brake, DRS and gear fields', () => {
    const [sample] = placeSamplesOnLap([row(10, { brake: 1, drs: 12, n_gear: 3 })], START, 90);
    expect(sample).toMatchObject({ brake: 100, drs: true, gear: 3 });
    const [closed] = placeSamplesOnLap([row(10, { drs: 0 })], START, 90);
    expect(closed.drs).toBe(false);
  });

  it('keeps DRS unknown when the feed has no value', () => {
    const [sample] = placeSamplesOnLap([row(10, { drs: undefined })], START, 90);
    expect(sample.drs).toBeNull();
  });

  it('returns nothing for a missing or zero lap duration', () => {
    expect(placeSamplesOnLap([row(10)], START, 0)).toEqual([]);
  });
});

describe('sampleAtProgress', () => {
  const samples = placeSamplesOnLap([row(0, { speed: 100 }), row(45, { speed: 200 }), row(90, { speed: 300 })], START, 90);

  it('returns the nearest sample', () => {
    expect(sampleAtProgress(samples, 0.4)?.speed).toBe(200);
    expect(sampleAtProgress(samples, 0.9)?.speed).toBe(300);
    expect(sampleAtProgress(samples, 0.01)?.speed).toBe(100);
  });

  it('returns null when there are no samples', () => {
    expect(sampleAtProgress([], 0.5)).toBeNull();
  });
});

describe('summarizeLapSamples', () => {
  it('averages speed and gear and reports percentages of time', () => {
    const samples = placeSamplesOnLap(
      [row(10, { speed: 100, brake: 1, drs: 12, n_gear: 2 }), row(20, { speed: 300, brake: 0, drs: 0, n_gear: 8 })],
      START,
      90,
    );
    expect(summarizeLapSamples(samples)).toEqual({
      avgSpeed: '200.00',
      avgThrottle: '100.00',
      pctBraking: '50.00',
      pctDrs: '50.00',
      avgGear: '5.00',
    });
  });

  it('reports DRS as n/a when no sample has a DRS value', () => {
    const samples = placeSamplesOnLap([row(10, { drs: undefined }), row(20, { drs: undefined })], START, 90);
    expect(summarizeLapSamples(samples)?.pctDrs).toBe('n/a');
  });

  it('returns null without samples', () => {
    expect(summarizeLapSamples([])).toBeNull();
  });
});
