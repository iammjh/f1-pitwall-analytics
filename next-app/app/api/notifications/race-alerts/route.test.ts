import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  logCreate: vi.fn(),
  logDeleteMany: vi.fn(),
  fetchSeasonRaces: vi.fn(),
  sendMail: vi.fn(),
  isMailConfigured: vi.fn(),
  isPushConfigured: vi.fn(),
  sendPush: vi.fn(),
  pushDeleteMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    userPreferences: { findMany: mocks.findMany },
    notificationLog: { create: mocks.logCreate, deleteMany: mocks.logDeleteMany },
    pushSubscription: { deleteMany: mocks.pushDeleteMany },
  }),
}));
vi.mock('@/lib/jolpica-client', () => ({ fetchSeasonRaces: mocks.fetchSeasonRaces }));
vi.mock('@/lib/mailer', () => ({ sendMail: mocks.sendMail, isMailConfigured: mocks.isMailConfigured }));
vi.mock('@/lib/push', () => ({ sendPush: mocks.sendPush, isPushConfigured: mocks.isPushConfigured }));

import { GET } from '@/app/api/notifications/race-alerts/route';

const SECRET = 'test-cron-secret';

function request(authorization?: string) {
  return new Request('http://localhost/api/notifications/race-alerts', {
    headers: authorization ? { authorization } : {},
  });
}

/** A race that starts 30 minutes from now, in the same shape Jolpica returns. */
function raceStartingSoon() {
  const start = new Date(Date.now() + 30 * 60 * 1000);
  return {
    round: '5',
    raceName: 'Test Grand Prix',
    date: start.toISOString().slice(0, 10),
    time: start.toISOString().slice(11, 19) + 'Z',
    Circuit: { circuitName: 'Test Circuit', Location: { locality: 'Town', country: 'Land' } },
  };
}

const RECIPIENTS = [
  { user: { id: '64b000000000000000000001', email: 'one@example.test' } },
  { user: { id: '64b000000000000000000002', email: 'two@example.test' } },
];

describe('GET /api/notifications/race-alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    mocks.isMailConfigured.mockReturnValue(true);
    mocks.isPushConfigured.mockReturnValue(false);
    mocks.fetchSeasonRaces.mockResolvedValue([raceStartingSoon()]);
    mocks.findMany.mockResolvedValue(RECIPIENTS);
    mocks.logCreate.mockResolvedValue({});
    mocks.logDeleteMany.mockResolvedValue({ count: 1 });
    mocks.sendMail.mockResolvedValue({ sent: true });
  });

  it('is disabled when CRON_SECRET is not set', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await GET(request(`Bearer ${SECRET}`) as any);
    expect(res.status).toBe(503);
  });

  it('rejects callers without the cron secret', async () => {
    expect((await GET(request() as any)).status).toBe(401);
    expect((await GET(request('Bearer wrong') as any)).status).toBe(401);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('refuses to run when SMTP is not configured', async () => {
    mocks.isMailConfigured.mockReturnValue(false);
    const res = await GET(request(`Bearer ${SECRET}`) as any);
    expect(res.status).toBe(503);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('sends each alert once per user and reports the counts', async () => {
    // First user gets the alert; the second already has it (unique key conflict).
    mocks.logCreate.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('duplicate key'));
    const res = await GET(request(`Bearer ${SECRET}`) as any);
    const body = await res.json();

    expect(body).toEqual({ races: 1, recipients: 2, sent: 1, alreadySent: 1, failed: 0 });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail.mock.calls[0][0].to).toBe('one@example.test');
    expect(mocks.logCreate).toHaveBeenCalledWith({
      data: { userId: '64b000000000000000000001', eventKey: 'race-start:' + new Date().getUTCFullYear() + ':5', channel: 'email' },
    });
  });

  it('releases the reservation when sending fails so the next run retries', async () => {
    mocks.sendMail.mockResolvedValueOnce({ sent: false, reason: 'failed', error: 'SMTP down' });
    const res = await GET(request(`Bearer ${SECRET}`) as any);
    const body = await res.json();

    expect(body).toMatchObject({ sent: 1, failed: 1 });
    expect(mocks.logDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.logDeleteMany.mock.calls[0][0].where.userId).toBe('64b000000000000000000001');
  });

  it('sends push to every device of opted-in users, once per race', async () => {
    mocks.isMailConfigured.mockReturnValue(false);
    mocks.isPushConfigured.mockReturnValue(true);
    mocks.findMany.mockResolvedValueOnce([
      {
        user: {
          id: '64b000000000000000000001',
          pushSubscriptions: [
            { endpoint: 'https://push.example.test/a', p256dh: 'p', auth: 'a' },
            { endpoint: 'https://push.example.test/b', p256dh: 'p', auth: 'a' },
          ],
        },
      },
    ]);
    mocks.sendPush.mockResolvedValue({ sent: true });

    const res = await GET(request(`Bearer ${SECRET}`) as any);
    const body = await res.json();

    expect(body.push).toMatchObject({ recipients: 1, sent: 1, failed: 0, removed: 0 });
    expect(mocks.sendPush).toHaveBeenCalledTimes(2);
    expect(mocks.logCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ channel: 'push' }) });
  });

  it('removes subscriptions the push service reports as gone', async () => {
    mocks.isMailConfigured.mockReturnValue(false);
    mocks.isPushConfigured.mockReturnValue(true);
    mocks.findMany.mockResolvedValueOnce([
      { user: { id: '64b000000000000000000001', pushSubscriptions: [{ endpoint: 'https://push.example.test/gone', p256dh: 'p', auth: 'a' }] } },
    ]);
    mocks.sendPush.mockResolvedValue({ sent: false, gone: true, error: 'Gone' });

    const res = await GET(request(`Bearer ${SECRET}`) as any);
    const body = await res.json();

    expect(body.push).toMatchObject({ sent: 0, failed: 1, removed: 1 });
    expect(mocks.pushDeleteMany).toHaveBeenCalledWith({ where: { endpoint: 'https://push.example.test/gone' } });
  });

  it('does nothing when no race starts in the window', async () => {
    mocks.fetchSeasonRaces.mockResolvedValue([{ ...raceStartingSoon(), time: '23:59:59Z', date: '2001-01-01' }]);
    const res = await GET(request(`Bearer ${SECRET}`) as any);
    expect(await res.json()).toEqual({ races: 0, recipients: 0, sent: 0, alreadySent: 0, failed: 0 });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
