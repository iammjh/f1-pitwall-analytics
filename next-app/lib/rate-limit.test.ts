import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkRateLimit,
  clientIpFromHeaders,
  hitRateLimit,
  resetRateLimit,
} from '@/lib/rate-limit';

const RULE = { limit: 3, windowMs: 60_000 };

describe('hitRateLimit', () => {
  beforeEach(() => resetRateLimit('test-key'));

  it('allows hits up to the limit and refuses the next one', () => {
    const now = 1_000_000;
    expect(hitRateLimit('test-key', RULE, now).allowed).toBe(true);
    expect(hitRateLimit('test-key', RULE, now).allowed).toBe(true);
    expect(hitRateLimit('test-key', RULE, now).allowed).toBe(true);
    const refused = hitRateLimit('test-key', RULE, now);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSec).toBe(60);
  });

  it('opens a fresh window once the previous one has elapsed', () => {
    const start = 1_000_000;
    for (let i = 0; i < 4; i++) hitRateLimit('test-key', RULE, start);
    expect(hitRateLimit('test-key', RULE, start + 60_001).allowed).toBe(true);
  });

  it('keeps separate counters per key', () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) hitRateLimit('test-key', RULE, now);
    expect(hitRateLimit('test-key', RULE, now).allowed).toBe(false);
    expect(hitRateLimit('other-key', RULE, now).allowed).toBe(true);
    resetRateLimit('other-key');
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => resetRateLimit('check-key'));

  it('reports blocked state without counting a new hit', () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) hitRateLimit('check-key', RULE, now);
    expect(checkRateLimit('check-key', RULE, now).allowed).toBe(false);
    expect(checkRateLimit('check-key', RULE, now).allowed).toBe(false);
    // Two checks did not consume anything, so after the window the key is clear again.
    expect(checkRateLimit('check-key', RULE, now + 60_001).allowed).toBe(true);
  });

  it('is allowed when nothing has been recorded', () => {
    expect(checkRateLimit('check-key', RULE, 1_000_000)).toEqual({ allowed: true, retryAfterSec: 0 });
  });

  it('is cleared by resetRateLimit', () => {
    const now = 1_000_000;
    for (let i = 0; i < 4; i++) hitRateLimit('check-key', RULE, now);
    resetRateLimit('check-key');
    expect(checkRateLimit('check-key', RULE, now).allowed).toBe(true);
  });
});

describe('clientIpFromHeaders', () => {
  it('uses the rightmost X-Forwarded-For entry added by the proxy', () => {
    const headers = new Headers({ 'x-forwarded-for': 'spoofed-by-client, 203.0.113.7' });
    expect(clientIpFromHeaders(headers)).toBe('203.0.113.7');
  });

  it('reads plain header objects as NextAuth passes them', () => {
    expect(clientIpFromHeaders({ 'x-forwarded-for': ['198.51.100.2'] })).toBe('198.51.100.2');
  });

  it('falls back to X-Real-IP, then to a shared unknown bucket', () => {
    expect(clientIpFromHeaders(new Headers({ 'x-real-ip': '192.0.2.9' }))).toBe('192.0.2.9');
    expect(clientIpFromHeaders(new Headers())).toBe('unknown');
    expect(clientIpFromHeaders(undefined)).toBe('unknown');
  });
});
