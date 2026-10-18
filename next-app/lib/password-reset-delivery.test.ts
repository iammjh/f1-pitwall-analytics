import type { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { isMailConfigured, sendMail, requestPasswordReset, passwordResetOrigin } = vi.hoisted(() => ({
  isMailConfigured: vi.fn(), sendMail: vi.fn(), requestPasswordReset: vi.fn(), passwordResetOrigin: vi.fn(),
}));
vi.mock('@/lib/mailer', () => ({ isMailConfigured, sendMail }));
vi.mock('@/lib/password-reset', () => ({ requestPasswordReset, passwordResetOrigin }));
import { processPasswordResetDeliveries } from './password-reset-delivery';

const now = new Date('2026-10-18T12:00:00Z');
const job = { id: '0123456789abcdef01234567', kind: 'request', email: 'driver@example.com', attempts: 0 };
function client() {
  const outbox = {
    findFirst: vi.fn().mockResolvedValueOnce(job).mockResolvedValue(null),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockImplementation(async ({ where }) => ({ count: where.AND ? 0 : 1 })),
  };
  return { outbox, prisma: { passwordResetDelivery: outbox } as unknown as PrismaClient };
}

describe('durable recovery delivery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    isMailConfigured.mockReturnValue(true);
    passwordResetOrigin.mockReturnValue('https://pitwall.example');
    requestPasswordReset.mockResolvedValue(true);
    sendMail.mockResolvedValue({ sent: true });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('skips without touching the database when SMTP is unavailable', async () => {
    const { prisma, outbox } = client();
    isMailConfigured.mockReturnValue(false);
    expect(await processPasswordResetDeliveries(prisma)).toMatchObject({ skipped: true, claimed: 0 });
    expect(outbox.findFirst).not.toHaveBeenCalled();
    expect(outbox.deleteMany).not.toHaveBeenCalled();
  });

  it('atomically leases a job and deletes only its owned claim after delivery', async () => {
    const { prisma, outbox } = client();
    expect(await processPasswordResetDeliveries(prisma, { now: () => now })).toMatchObject({ claimed: 1, delivered: 1 });
    const claim = outbox.updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: job.id, attempts: { lt: 5 }, expires: { gt: now } });
    expect(claim.data).toMatchObject({ leaseUntil: new Date(now.getTime() + 120_000), attempts: { increment: 1 } });
    expect(claim.data.claimToken).toMatch(/^[a-f\d]{48}$/);
    expect(requestPasswordReset).toHaveBeenCalledWith(prisma, job.email, 'https://pitwall.example', now);
    expect(outbox.deleteMany).toHaveBeenLastCalledWith({ where: { id: job.id, claimToken: claim.data.claimToken } });
  });

  it('does not send a job claimed concurrently by another worker', async () => {
    const { prisma, outbox } = client();
    outbox.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await processPasswordResetDeliveries(prisma)).toMatchObject({ claimed: 0, delivered: 0 });
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it('releases failed deliveries with backoff without storing SMTP error details', async () => {
    const { prisma, outbox } = client();
    requestPasswordReset.mockRejectedValueOnce(new Error('PRIVATE smtp credentials and token'));
    expect(await processPasswordResetDeliveries(prisma, { now: () => now })).toMatchObject({ retried: 1 });
    expect(outbox.updateMany.mock.calls[1][0]).toMatchObject({ data: {
      claimToken: null, leaseUntil: null, availableAt: new Date(now.getTime() + 60_000),
    } });
    expect(JSON.stringify(outbox.updateMany.mock.calls)).not.toContain('PRIVATE');
  });

  it('discards failed fifth attempts and unsupported job kinds', async () => {
    for (const queued of [{ ...job, attempts: 4 }, { ...job, kind: 'invalid' }]) {
      const { prisma, outbox } = client();
      outbox.findFirst.mockReset().mockResolvedValueOnce(queued).mockResolvedValue(null);
      requestPasswordReset.mockResolvedValue(false);
      expect(await processPasswordResetDeliveries(prisma)).toMatchObject({ discarded: 1, retried: 0 });
    }
  });

  it('sends change notices without embedding a password or recovery token', async () => {
    const { prisma, outbox } = client();
    outbox.findFirst.mockReset().mockResolvedValueOnce({ ...job, kind: 'changed' }).mockResolvedValue(null);
    expect(await processPasswordResetDeliveries(prisma)).toMatchObject({ delivered: 1 });
    expect(requestPasswordReset).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: job.email, subject: 'Your Pitwall password was changed' }));
    expect(JSON.stringify(sendMail.mock.calls)).not.toContain('token=');
  });

  it('preserves an expired job with an active lease during cleanup and limits each batch', async () => {
    const { prisma, outbox } = client();
    await processPasswordResetDeliveries(prisma, { batchSize: 1, now: () => now });
    expect(outbox.findFirst).toHaveBeenCalledOnce();
    expect(outbox.deleteMany.mock.calls[0][0]).toMatchObject({ where: { AND: [
      { OR: [{ leaseUntil: null }, { leaseUntil: { isSet: false } }, { leaseUntil: { lte: now } }] },
      { OR: [{ expires: { lte: now } }, { attempts: { gte: 5 } }] },
    ] } });
  });

  it('does not delete a job if ownership was lost during delivery', async () => {
    const { prisma, outbox } = client();
    outbox.deleteMany.mockResolvedValue({ count: 0 });
    expect(await processPasswordResetDeliveries(prisma)).toMatchObject({ lostClaims: 1, delivered: 0 });
  });
});
