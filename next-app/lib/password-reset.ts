import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { sendMail } from '@/lib/mailer';
import { validatePassword } from '@/lib/password-validation';

const RESET_TTL_MS = 30 * 60_000;
const IDENTIFIER_PREFIX = 'password-reset:';
export const RESET_ACCEPTED_MESSAGE = 'If this email belongs to an account with a password, a recovery link will arrive shortly.';
export const INVALID_RESET_MESSAGE = 'This reset link is invalid or expired. Request a new link.';

export function passwordVersion(hash: string): string {
  return createHash('sha256').update(hash).digest('hex');
}
function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }

export function passwordResetOrigin(): string {
  const configured = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error('Password recovery requires an explicit trusted app URL.');
  }
  const origin = new URL(configured || 'http://localhost:3000');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && local)) {
    throw new Error('Password recovery requires a trusted HTTPS app URL.');
  }
  return origin.origin;
}

/** The same durable write is performed for existing and unknown accounts. */
export async function enqueuePasswordReset(prisma: PrismaClient, email: string, now = new Date()): Promise<void> {
  await prisma.passwordResetDelivery.create({
    data: { kind: 'request', email, expires: new Date(now.getTime() + RESET_TTL_MS) },
  });
}

/** No raw tokens are persisted or returned to the HTTP client. */
export async function requestPasswordReset(prisma: PrismaClient, email: string, origin: string, now = new Date()): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, password: true } });
  if (!user?.email || !user.password) return true;

  const token = randomBytes(32).toString('hex');
  const digest = tokenHash(token);
  const identifier = `${IDENTIFIER_PREFIX}${user.id}:${passwordVersion(user.password)}`;
  await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: `${IDENTIFIER_PREFIX}${user.id}:` }, expires: { lte: now } } });
  await prisma.verificationToken.create({ data: { identifier, token: digest, expires: new Date(now.getTime() + RESET_TTL_MS) } });
  const link = new URL('/auth/reset-password', origin);
  link.searchParams.set('token', token);
  const safeLink = link.toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const message = {
    to: user.email, subject: 'Reset your Pitwall Analytics Hub password',
    text: `Reset your password: ${link}\n\nThis link expires in 30 minutes and can be used once. If you did not request it, ignore this email.`,
    html: `<p>A password reset was requested for your Pitwall Analytics Hub account.</p><p><a href="${safeLink}">Choose a new password</a></p><p>This link expires in 30 minutes and can be used once. If you did not request it, ignore this email.</p>`,
  };
  try {
    const result = await sendMail(message);
    if (!result.sent) await prisma.verificationToken.deleteMany({ where: { token: digest } });
    return result.sent;
  } catch {
    await prisma.verificationToken.deleteMany({ where: { token: digest } });
    return false;
  }
}

function parseIdentifier(identifier: string) {
  const match = /^password-reset:([a-f\d]{24}):([a-f\d]{64})$/i.exec(identifier);
  return match ? { userId: match[1], version: match[2] } : null;
}

/** Atomically consumes the link and changes the password; concurrent replays cannot win twice. */
export async function confirmPasswordReset(prisma: PrismaClient, token: unknown, password: unknown, clock: () => Date = () => new Date()): Promise<boolean> {
  if (typeof token !== 'string' || !/^[a-f\d]{64}$/i.test(token)) return false;
  const checked = validatePassword(password, true);
  if (!checked.ok) return false;
  const digest = tokenHash(token);
  const snapshot = await prisma.verificationToken.findUnique({ where: { token: digest } });
  if (!snapshot || snapshot.expires <= clock() || !parseIdentifier(snapshot.identifier)) return false;
  const hash = await bcrypt.hash(checked.value, 12);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const changed = await prisma.$transaction(async tx => {
        // Hashing or a transaction retry can cross the expiry boundary.
        const now = clock();
        const record = await tx.verificationToken.findUnique({ where: { token: digest } });
        const identity = record ? parseIdentifier(record.identifier) : null;
        if (!record || record.expires <= now || !identity) return false;
        const user = await tx.user.findUnique({ where: { id: identity.userId }, select: { password: true, email: true } });
        if (!user?.password || passwordVersion(user.password) !== identity.version) return false;
        const consumed = await tx.verificationToken.deleteMany({ where: { token: digest, expires: { gt: now } } });
        if (consumed.count !== 1) return false;
        await tx.user.update({ where: { id: identity.userId }, data: { password: hash, passwordChangedAt: now } });
        await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: `${IDENTIFIER_PREFIX}${identity.userId}:` } } });
        await tx.session.deleteMany({ where: { userId: identity.userId } });
        if (user.email) await tx.passwordResetDelivery.create({ data: {
          kind: 'changed', email: user.email, expires: new Date(now.getTime() + 24 * 60 * 60_000),
        } });
        return true;
      });
      return changed;
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2034' || attempt === 2) throw error;
    }
  }
  return false;
}
