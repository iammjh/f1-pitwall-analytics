import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(), confirm: vi.fn(), origin: vi.fn(), configured: vi.fn(),
  limit: vi.fn(), deliveries: vi.fn(), prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock('@/lib/prisma', () => ({ getPrisma: () => mocks.prisma }));
vi.mock('@/lib/mailer', () => ({ isMailConfigured: mocks.configured }));
vi.mock('@/lib/password-reset', () => ({
  enqueuePasswordReset: mocks.enqueue, confirmPasswordReset: mocks.confirm, passwordResetOrigin: mocks.origin,
  RESET_ACCEPTED_MESSAGE: 'If this email belongs to an account with a password, a recovery link will arrive shortly.',
  INVALID_RESET_MESSAGE: 'This reset link is invalid or expired. Request a new link.',
}));
vi.mock('@/lib/password-reset-delivery', () => ({ processPasswordResetDeliveries: mocks.deliveries }));
vi.mock('@/lib/rate-limit', () => ({ hitRateLimit: mocks.limit, clientIpFromHeaders: () => '127.0.0.1' }));
import { POST as requestReset } from './request/route';
import { POST as confirmReset } from './confirm/route';
import { GET as deliver } from './deliver/route';

function request(body: unknown) {
  return new Request('https://pitwall.example/api/auth/password-reset/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('password recovery HTTP endpoints', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('CRON_SECRET', 'test-scheduler-secret');
    mocks.limit.mockReturnValue({ allowed: true, retryAfterSec: 0 });
    mocks.configured.mockReturnValue(true);
    mocks.origin.mockReturnValue('https://pitwall.example');
    mocks.enqueue.mockResolvedValue(undefined);
    mocks.confirm.mockResolvedValue(true);
    mocks.deliveries.mockResolvedValue({ claimed: 1, delivered: 1, skipped: false });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns identical private accepted messages without account lookups', async () => {
    const responses = await Promise.all(['DRIVER@example.com', 'unknown@example.com'].map(email => requestReset(request({ email }))));
    expect(responses.map(response => response.status)).toEqual([202, 202]);
    const bodies = await Promise.all(responses.map(response => response.json()));
    expect(bodies[0]).toEqual(bodies[1]);
    expect(JSON.stringify(bodies)).not.toContain('token');
    expect(responses.every(response => response.headers.get('cache-control') === 'no-store')).toBe(true);
    expect(mocks.enqueue).toHaveBeenCalledWith(mocks.prisma, 'driver@example.com');
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects invalid email and malformed JSON without queuing mail', async () => {
    expect((await requestReset(request({ email: 'invalid' }))).status).toBe(400);
    expect((await requestReset(new Request('https://pitwall.example', { method: 'POST', body: '{' }))).status).toBe(400);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('reports unavailable email or scheduler configuration uniformly', async () => {
    mocks.configured.mockReturnValueOnce(false);
    expect((await requestReset(request({ email: 'driver@example.com' }))).status).toBe(503);
    vi.stubEnv('CRON_SECRET', '');
    expect((await requestReset(request({ email: 'unknown@example.com' }))).status).toBe(503);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('rejects invalid trusted-origin configuration before queuing', async () => {
    mocks.origin.mockImplementationOnce(() => { throw new Error('private config'); });
    const response = await requestReset(request({ email: 'driver@example.com' }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('private config');
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('applies IP limits and hides email-specific throttling behind the accepted message', async () => {
    mocks.limit.mockReturnValueOnce({ allowed: false, retryAfterSec: 30 });
    const limited = await requestReset(request({ email: 'driver@example.com' }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('30');
    mocks.limit.mockReturnValueOnce({ allowed: true }).mockReturnValueOnce({ allowed: false });
    expect((await requestReset(request({ email: 'driver@example.com' }))).status).toBe(202);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('checks password limits and confirmation before consuming a link', async () => {
    expect((await confirmReset(request({ token: 'a'.repeat(64), password: 'valid-password', confirmation: 'different' }))).status).toBe(400);
    expect((await confirmReset(request({ token: 'a'.repeat(64), password: 'a'.repeat(73), confirmation: 'a'.repeat(73) }))).status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('returns success only for consumed links and keeps failure details private', async () => {
    const body = { token: 'a'.repeat(64), password: 'new-password', confirmation: 'new-password' };
    expect((await confirmReset(request(body))).status).toBe(200);
    mocks.confirm.mockResolvedValueOnce(false);
    expect((await confirmReset(request(body))).status).toBe(400);
    mocks.confirm.mockRejectedValueOnce(new Error('PRIVATE database credentials'));
    const failed = await confirmReset(request(body));
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain('PRIVATE');
  });

  it('requires the scheduler secret before accessing recovery jobs', async () => {
    for (const authorization of ['', 'Bearer wrong-secret']) {
      expect((await deliver(new Request('https://pitwall.example', { headers: { authorization } }))).status).toBe(401);
    }
    expect(mocks.deliveries).not.toHaveBeenCalled();
    const response = await deliver(new Request('https://pitwall.example', { headers: { authorization: 'Bearer test-scheduler-secret' } }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ delivered: 1 });
  });
});
