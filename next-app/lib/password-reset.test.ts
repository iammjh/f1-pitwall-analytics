import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMail, hash } = vi.hoisted(() => ({ sendMail: vi.fn(), hash: vi.fn() }));
vi.mock('@/lib/mailer', () => ({ sendMail }));
vi.mock('bcryptjs', () => ({ default: { hash } }));

import { confirmPasswordReset, enqueuePasswordReset, passwordResetOrigin, passwordVersion, requestPasswordReset } from './password-reset';

const userId = '0123456789abcdef01234567';
const rawToken = 'a'.repeat(64);
const digest = createHash('sha256').update(rawToken).digest('hex');
const oldHash = '$2a$12$old-password-hash';
const newHash = '$2a$12$new-password-hash';
const now = new Date('2026-10-18T12:00:00Z');

function client() {
  const state = { tokenPresent: true, password: oldHash };
  const record = { token: digest, identifier: `password-reset:${userId}:${passwordVersion(oldHash)}`, expires: new Date(now.getTime() + 30 * 60_000) };
  const db = {
    user: {
      findUnique: vi.fn(async () => ({ id: userId, email: 'driver@example.com', password: state.password })),
      update: vi.fn(async ({ data }: { data: { password: string; passwordChangedAt: Date } }) => { state.password = data.password; return { id: userId }; }),
    },
    verificationToken: {
      findUnique: vi.fn(async () => state.tokenPresent ? { ...record } : null),
      create: vi.fn(async ({ data }: { data: unknown }) => data),
      deleteMany: vi.fn(async ({ where }: { where: { token?: string; identifier?: unknown; expires?: { lte?: Date } } }) => {
        if (where.expires?.lte) return { count: 0 };
        const count = state.tokenPresent ? 1 : 0;
        state.tokenPresent = false;
        return { count };
      }),
    },
    session: { deleteMany: vi.fn(async () => ({ count: 2 })) },
    passwordResetDelivery: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
  return { db, prisma: db as unknown as PrismaClient, state, record };
}

describe('password recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    hash.mockResolvedValue(newHash);
    sendMail.mockResolvedValue({ sent: true });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it('queues recovery without looking up account existence or contacting SMTP', async () => {
    const { db, prisma } = client();
    await enqueuePasswordReset(prisma, 'driver@example.com', now);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(db.passwordResetDelivery.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      kind: 'request', email: 'driver@example.com', expires: new Date(now.getTime() + 30 * 60_000),
    }) });
  });

  it('stores only a digest while sending the raw link solely to the verified account email', async () => {
    const { db, prisma } = client();
    expect(await requestPasswordReset(prisma, 'driver@example.com', 'https://pitwall.example', now)).toBe(true);
    const message = sendMail.mock.calls[0][0];
    const raw = /token=([a-f\d]{64})/.exec(message.text)?.[1];
    expect(raw).toBeDefined();
    const stored = db.verificationToken.create.mock.calls[0][0].data as { token: string; identifier: string; expires: Date };
    expect(stored.token).toBe(createHash('sha256').update(raw!).digest('hex'));
    expect(stored.token).not.toBe(raw);
    expect(stored.identifier).toBe(`password-reset:${userId}:${passwordVersion(oldHash)}`);
    expect(stored.expires).toEqual(new Date(now.getTime() + 30 * 60_000));
    expect(message.to).toBe('driver@example.com');
    expect(message.text).toContain('https://pitwall.example/auth/reset-password?token=');
  });

  it('treats unknown and OAuth-only accounts as completed no-ops', async () => {
    for (const account of [null, { id: userId, email: 'driver@example.com', password: null }]) {
      const { db, prisma } = client();
      db.user.findUnique.mockResolvedValueOnce(account as never);
      expect(await requestPasswordReset(prisma, 'driver@example.com', 'https://pitwall.example', now)).toBe(true);
      expect(db.verificationToken.create).not.toHaveBeenCalled();
    }
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('deletes undelivered token digests and reports delivery failure for retry', async () => {
    for (const throws of [false, true]) {
      const { db, prisma } = client();
      if (throws) sendMail.mockRejectedValueOnce(new Error('PRIVATE SMTP details'));
      else sendMail.mockResolvedValueOnce({ sent: false, reason: 'failed', error: 'PRIVATE SMTP details' });
      expect(await requestPasswordReset(prisma, 'driver@example.com', 'https://pitwall.example', now)).toBe(false);
      const stored = db.verificationToken.create.mock.calls[0][0].data as { token: string };
      expect(db.verificationToken.deleteMany).toHaveBeenLastCalledWith({ where: { token: stored.token } });
    }
  });

  it('validates token shape and bcrypt byte limits before accessing the database', async () => {
    const { db, prisma } = client();
    expect(await confirmPasswordReset(prisma, '<script>', 'new-password')).toBe(false);
    expect(await confirmPasswordReset(prisma, rawToken, '🔒'.repeat(19))).toBe(false);
    expect(await confirmPasswordReset(prisma, rawToken, 'short')).toBe(false);
    expect(db.verificationToken.findUnique).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
  });

  it('rejects expired or malformed reset records before hashing', async () => {
    for (const invalid of [{ expires: now }, { identifier: 'oauth:token' }]) {
      const { prisma, record, db } = client();
      Object.assign(record, invalid);
      expect(await confirmPasswordReset(prisma, rawToken, 'new-password')).toBe(false);
      expect(db.$transaction).not.toHaveBeenCalled();
    }
    expect(hash).not.toHaveBeenCalled();
  });

  it('rejects a token that expires while bcrypt hashing is in progress', async () => {
    const { prisma, record, db } = client();
    record.expires = new Date(now.getTime() + 500);
    hash.mockImplementationOnce(async () => { vi.setSystemTime(now.getTime() + 1_000); return newHash; });
    expect(await confirmPasswordReset(prisma, rawToken, 'new-password')).toBe(false);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.session.deleteMany).not.toHaveBeenCalled();
    expect(db.passwordResetDelivery.create).not.toHaveBeenCalled();
  });

  it('rejects an outstanding link after the account password changes', async () => {
    const { prisma, state, db } = client();
    state.password = '$2a$12$changed-elsewhere';
    expect(await confirmPasswordReset(prisma, rawToken, 'new-password')).toBe(false);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('consumes a reset link once and revokes sessions in the same transaction', async () => {
    const { prisma, db } = client();
    expect(await confirmPasswordReset(prisma, rawToken, 'new-password')).toBe(true);
    expect(await confirmPasswordReset(prisma, rawToken, 'new-password')).toBe(false);
    expect(hash).toHaveBeenCalledWith('new-password', 12);
    expect(db.user.update).toHaveBeenCalledOnce();
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: userId }, data: { password: newHash, passwordChangedAt: now } });
    expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { userId } });
    expect(db.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { identifier: { startsWith: `password-reset:${userId}:` } } });
    expect(db.passwordResetDelivery.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'changed', email: 'driver@example.com' }) });
    const deliveries = JSON.stringify(db.passwordResetDelivery.create.mock.calls);
    expect(deliveries).not.toContain(rawToken);
    expect(deliveries).not.toContain('new-password');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('allows only one winner when two requests consume the same token concurrently', async () => {
    const { prisma, db } = client();
    const results = await Promise.all([
      confirmPasswordReset(prisma, rawToken, 'first-password'),
      confirmPasswordReset(prisma, rawToken, 'second-password'),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(db.user.update).toHaveBeenCalledOnce();
    expect(db.passwordResetDelivery.create).toHaveBeenCalledOnce();
  });

  it('retries MongoDB transaction conflicts without sending email from the confirmation response', async () => {
    const { prisma, db } = client();
    db.$transaction.mockRejectedValueOnce(Object.assign(new Error('write conflict'), { code: 'P2034' }));
    expect(await confirmPasswordReset(prisma, rawToken, 'new-password')).toBe(true);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(db.user.update).toHaveBeenCalledOnce();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('refuses untrusted origins and strips paths from trusted recovery URLs', () => {
    vi.stubEnv('NEXTAUTH_URL', 'http://attacker.example/path');
    expect(passwordResetOrigin).toThrow('HTTPS');
    vi.stubEnv('NEXTAUTH_URL', 'https://pitwall.example/deployment/path');
    expect(passwordResetOrigin()).toBe('https://pitwall.example');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
    expect(passwordResetOrigin()).toBe('http://localhost:3000');
  });
});
