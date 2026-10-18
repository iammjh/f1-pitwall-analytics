import { describe, expect, it } from 'vitest';
import { getLatestSeason, getSeasonOptions } from '@/lib/seasons';

describe('getSeasonOptions', () => {
  it('lists seasons from the current year down to the first season, newest first', () => {
    const now = new Date('2026-10-18T00:00:00Z');
    expect(getSeasonOptions(2024, now)).toEqual(['2026', '2025', '2024']);
  });

  it('follows the calendar year when it advances', () => {
    expect(getSeasonOptions(2026, new Date('2027-01-05T00:00:00Z'))).toEqual(['2027', '2026']);
  });

  it('returns an empty list when the first season is after the latest', () => {
    expect(getSeasonOptions(2030, new Date('2026-10-18T00:00:00Z'))).toEqual([]);
  });
});

describe('getLatestSeason', () => {
  it('uses the calendar year of the given date', () => {
    expect(getLatestSeason(new Date('2031-06-01T00:00:00Z'))).toBe(2031);
  });
});
