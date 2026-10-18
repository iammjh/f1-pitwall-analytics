import { NextResponse } from 'next/server';
import { clientIpFromHeaders, hitRateLimit, type RateLimitRule } from '@/lib/rate-limit';

// Generous enough for a dashboard page load; blocks scripted hammering of the upstream APIs.
const PUBLIC_API_RULE: RateLimitRule = { limit: 300, windowMs: 60 * 1000 };

/** Returns a 429 response when the client has exceeded the public data limit, otherwise null. */
export function enforcePublicRateLimit(request: Request, scope: string): NextResponse | null {
  const ip = clientIpFromHeaders(request.headers);
  const result = hitRateLimit(`public:${scope}:${ip}`, PUBLIC_API_RULE);
  if (result.allowed) return null;

  return NextResponse.json(
    { error: 'Too many requests. Please slow down and try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSec) } },
  );
}

/** Lets shared caches (CDN, Vercel edge) reuse a successful response for `maxAge` seconds. */
export function publicCacheHeaders(maxAge: number, staleWhileRevalidate = maxAge * 4): Record<string, string> {
  return { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}` };
}

const MAX_CACHE_ENTRIES = 200;

/** Small per-process cache so repeated requests don't re-hit the upstream API. */
export function createTtlCache<T>(ttlMs: number) {
  const entries = new Map<string, { value: T; expiresAt: number }>();

  return {
    get(key: string, now = Date.now()): T | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: T, now = Date.now()) {
      if (entries.size >= MAX_CACHE_ENTRIES) {
        for (const [k, entry] of entries) {
          if (entry.expiresAt <= now) entries.delete(k);
        }
        if (entries.size >= MAX_CACHE_ENTRIES) entries.delete(entries.keys().next().value as string);
      }
      entries.set(key, { value, expiresAt: now + ttlMs });
    },
  };
}
