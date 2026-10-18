export interface RateLimitRule {
  /** Hits allowed per window before further requests are refused. */
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

// Fixed-window counters kept per process. Limits are not shared across serverless instances.
const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;

function pruneExpired(now: number) {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function currentBucket(key: string, rule: RateLimitRule, now: number): Bucket {
  const existing = buckets.get(key);
  if (existing && existing.resetAt > now) return existing;
  const fresh = { count: 0, resetAt: now + rule.windowMs };
  buckets.set(key, fresh);
  return fresh;
}

function retryAfter(bucket: Bucket, now: number): number {
  return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
}

/** Counts one hit against `key` and reports whether it is still within the limit. */
export function hitRateLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
  pruneExpired(now);
  const bucket = currentBucket(key, rule, now);
  bucket.count += 1;
  return { allowed: bucket.count <= rule.limit, retryAfterSec: retryAfter(bucket, now) };
}

/** Reports whether `key` has already used up its limit, without counting a new hit. */
export function checkRateLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) return { allowed: true, retryAfterSec: 0 };
  return { allowed: bucket.count < rule.limit, retryAfterSec: retryAfter(bucket, now) };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}

type HeaderSource = { get(name: string): string | null } | Record<string, unknown> | null | undefined;

function readHeader(headers: HeaderSource, name: string): string | null {
  if (!headers) return null;
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(name: string): string | null }).get(name);
  }
  const value = (headers as Record<string, unknown>)[name];
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null;
  return typeof value === 'string' ? value : null;
}

/**
 * Best-effort client address. The rightmost X-Forwarded-For entry is the one the trusted proxy
 * appended; the leftmost can be supplied by the client. Falls back to a shared "unknown" bucket.
 */
export function clientIpFromHeaders(headers: HeaderSource): string {
  const forwarded = readHeader(headers, 'x-forwarded-for');
  const last = forwarded?.split(',').map((part) => part.trim()).filter(Boolean).pop();
  return last || readHeader(headers, 'x-real-ip')?.trim() || 'unknown';
}
