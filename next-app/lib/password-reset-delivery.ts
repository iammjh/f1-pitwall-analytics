import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { isMailConfigured, sendMail } from '@/lib/mailer';
import { passwordResetOrigin, requestPasswordReset } from '@/lib/password-reset';

const MAX_ATTEMPTS = 5;
const LEASE_MS = 120_000;

function availableLease(now: Date) {
  return { OR: [{ leaseUntil: null }, { leaseUntil: { isSet: false } }, { leaseUntil: { lte: now } }] };
}

/** A durable, bounded worker. Delivery retries never depend on a request process staying alive. */
export async function processPasswordResetDeliveries(prisma: PrismaClient, options: {
  batchSize?: number;
  now?: () => Date;
  maxRunMs?: number;
} = {}) {
  const summary = { claimed: 0, delivered: 0, retried: 0, discarded: 0, lostClaims: 0, skipped: false };
  if (!isMailConfigured()) return { ...summary, skipped: true };
  const origin = passwordResetOrigin();
  const clock = options.now ?? (() => new Date());
  const batchSize = Math.min(50, Math.max(1, options.batchSize ?? 10));
  const deadline = Date.now() + Math.min(45_000, Math.max(1, options.maxRunMs ?? 45_000));
  const initialNow = clock();
  // Keep active leases even if their job has expired: another worker may still be sending it.
  const cleanup = await prisma.passwordResetDelivery.deleteMany({ where: {
    AND: [availableLease(initialNow), { OR: [{ expires: { lte: initialNow } }, { attempts: { gte: MAX_ATTEMPTS } }] }],
  } });
  summary.discarded += cleanup.count;

  for (let scanned = 0; scanned < batchSize * 3 && summary.claimed < batchSize && Date.now() < deadline; scanned++) {
    const now = clock();
    const eligible = {
      availableAt: { lte: now }, expires: { gt: now }, attempts: { lt: MAX_ATTEMPTS }, ...availableLease(now),
    };
    const job = await prisma.passwordResetDelivery.findFirst({ where: eligible, orderBy: { createdAt: 'asc' } });
    if (!job) break;
    const claimToken = randomBytes(24).toString('hex');
    const claim = await prisma.passwordResetDelivery.updateMany({
      where: { id: job.id, ...eligible },
      data: { claimToken, leaseUntil: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 } },
    });
    if (claim.count !== 1) continue;
    summary.claimed++;
    let delivered = false;
    let invalid = false;
    try {
      if (job.kind === 'request') {
        delivered = await requestPasswordReset(prisma, job.email, origin, clock());
      } else if (job.kind === 'changed') {
        delivered = (await sendMail({
          to: job.email, subject: 'Your Pitwall password was changed',
          text: 'Your password was changed and previous sessions were signed out. If you did not make this change, request a new recovery link immediately.',
          html: '<p>Your password was changed and previous sessions were signed out.</p><p>If you did not make this change, request a new recovery link immediately.</p>',
        })).sent;
      } else invalid = true;
    } catch {
      // Store no exception body: it can contain email addresses, SMTP credentials, or tokens.
    }
    const owned = { id: job.id, claimToken };
    if (delivered || invalid || job.attempts + 1 >= MAX_ATTEMPTS) {
      const removed = await prisma.passwordResetDelivery.deleteMany({ where: owned });
      if (!removed.count) summary.lostClaims++;
      else if (delivered) summary.delivered++;
      else summary.discarded++;
    } else {
      const delay = 60_000 * 2 ** job.attempts;
      const released = await prisma.passwordResetDelivery.updateMany({ where: owned, data: {
        claimToken: null, leaseUntil: null, availableAt: new Date(clock().getTime() + delay),
      } });
      if (!released.count) summary.lostClaims++;
      else summary.retried++;
    }
  }
  return summary;
}
