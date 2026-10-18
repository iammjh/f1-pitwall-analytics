import { describe, expect, it } from 'vitest';
import { createTtlCache, publicCacheHeaders } from '@/lib/public-api';

describe('createTtlCache', () => {
  it('returns a stored value until it expires', () => {
    const cache = createTtlCache<string>(1000);
    cache.set('2026', 'payload', 0);
    expect(cache.get('2026', 999)).toBe('payload');
    expect(cache.get('2026', 1000)).toBeUndefined();
  });

  it('keeps keys independent', () => {
    const cache = createTtlCache<number>(1000);
    cache.set('2025', 1, 0);
    expect(cache.get('2026', 0)).toBeUndefined();
  });

  it('stays bounded when many keys are written', () => {
    const cache = createTtlCache<number>(60_000);
    for (let i = 0; i < 500; i++) cache.set(`k${i}`, i, 0);
    expect(cache.get('k499', 0)).toBe(499);
    expect(cache.get('k0', 0)).toBeUndefined();
  });
});

describe('publicCacheHeaders', () => {
  it('builds a shared-cache directive with stale-while-revalidate', () => {
    expect(publicCacheHeaders(900)).toEqual({
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
    });
  });
});
