import { describe, expect, it } from 'vitest';
import { getMaxSeason, parseRoundParam, parseSeasonParam, parseSessionKeyParam } from '@/lib/query-params';

describe('parseSeasonParam', () => {
  it('defaults to the current year when omitted', () => {
    const result = parseSeasonParam(null);
    expect(result).toEqual({ ok: true, value: new Date().getFullYear() });
  });

  it('accepts a valid season year', () => {
    expect(parseSeasonParam('2024')).toEqual({ ok: true, value: 2024 });
  });

  it('rejects non-numeric seasons', () => {
    const result = parseSeasonParam('20ab');
    expect(result.ok).toBe(false);
  });

  it('rejects out-of-range seasons', () => {
    const result = parseSeasonParam('1800');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(String(getMaxSeason()));
    }
  });
});

describe('parseRoundParam', () => {
  it('returns null when omitted', () => {
    expect(parseRoundParam(null)).toBeNull();
  });

  it('accepts a valid round', () => {
    expect(parseRoundParam('12')).toEqual({ ok: true, value: 12 });
  });

  it('rejects invalid round strings', () => {
    const result = parseRoundParam('abc');
    expect(result?.ok).toBe(false);
  });
});

describe('parseSessionKeyParam', () => {
  it('returns null when omitted or blank', () => {
    expect(parseSessionKeyParam(null)).toBeNull();
    expect(parseSessionKeyParam('   ')).toBeNull();
  });

  it('accepts a positive integer key', () => {
    expect(parseSessionKeyParam('11388')).toEqual({ ok: true, value: 11388 });
  });

  it('rejects non-numeric, signed, decimal, zero, and oversized keys', () => {
    for (const raw of ['abc', '12abc', '-5', '1.5', '0', '12345678901']) {
      expect(parseSessionKeyParam(raw)?.ok, raw).toBe(false);
    }
  });

  it('rejects separators and injected query text', () => {
    expect(parseSessionKeyParam('1&driver_number=1')?.ok).toBe(false);
    expect(parseSessionKeyParam('1/../2')?.ok).toBe(false);
  });
});
