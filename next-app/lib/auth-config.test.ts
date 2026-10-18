import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import type { User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import { passwordVersion } from './password-reset';
const { user } = vi.hoisted(() => ({ user: { findUnique: vi.fn(), create: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ getPrisma: () => ({ user }) }));
vi.mock('@/lib/user-onboarding', () => ({ ensureUserOnboarding: vi.fn() }));

async function options() {
  return (await import('./auth-config')).getAuthOptions();
}
async function authorize(credentials: { email: string; password: string; isSignUp?: string }) {
  const provider = (await options()).providers.find(provider => provider.id === 'credentials');
  const handler = (provider as unknown as {
    options: { authorize: (credentials: unknown, request: { headers: Record<string, string> }) => Promise<unknown> };
  }).options.authorize;
  return handler(credentials, { headers: { 'x-forwarded-for': '127.0.0.1' } });
}
async function jwt(token: Partial<JWT>, signedInUser?: User) {
  const callback = (await options()).callbacks!.jwt!;
  return callback({ token, user: signedInUser, account: null } as Parameters<typeof callback>[0]);
}

describe('authentication configuration and password enforcement', () => {
  beforeEach(() => {
    vi.resetModules(); vi.resetAllMocks();
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    for (const key of ['GITHUB_ID', 'GITHUB_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) vi.stubEnv(key, '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('registers only configured OAuth providers and uses existing/default auth pages', async () => {
    const config = await options();
    expect(config.providers.map(provider => provider.id)).toEqual(['credentials']);
    expect(config.pages).toEqual({ signIn: '/auth/signin' });
    vi.resetModules(); vi.stubEnv('GITHUB_ID', 'configured-id'); vi.stubEnv('GITHUB_SECRET', 'configured-secret');
    expect((await options()).providers.map(provider => provider.id)).toEqual(['github', 'credentials']);
  });

  it('rejects both colliding long passwords before comparing or storing them', async () => {
    for (const isSignUp of ['true', 'false']) {
      await expect(authorize({ email: 'driver@example.com', password: 'a'.repeat(72) + 'different suffix', isSignUp }))
        .rejects.toThrow('72 UTF-8 bytes');
    }
    expect(user.findUnique).not.toHaveBeenCalled();
    expect(user.create).not.toHaveBeenCalled();
  });

  it('authenticates an existing compatible bcrypt account', async () => {
    user.findUnique.mockResolvedValue({ id: 'existing-user', email: 'driver@example.com', name: 'Driver', password: await bcrypt.hash('existing-password', 4) });
    await expect(authorize({ email: 'DRIVER@example.com', password: 'existing-password' })).resolves.toMatchObject({ id: 'existing-user' });
    expect(user.create).not.toHaveBeenCalled();
  });

  it('revokes JWTs bound to a password that has since changed', async () => {
    user.findUnique.mockResolvedValue({ password: 'new-hash', passwordChangedAt: new Date() });
    await expect(jwt({ id: 'existing-user', passwordVersion: passwordVersion('old-hash') })).rejects.toThrow('Session expired');
  });

  it('keeps sessions bound to the current password valid', async () => {
    user.findUnique.mockResolvedValue({ password: 'current-hash', passwordChangedAt: new Date() });
    await expect(jwt({ id: 'existing-user', passwordVersion: passwordVersion('current-hash'), authenticatedAt: 1 }))
      .resolves.toMatchObject({ id: 'existing-user', authenticatedAt: 1 });
  });

  it('rejects a sign-in if recovery changes the password after bcrypt verification', async () => {
    const verifiedHash = await bcrypt.hash('existing-password', 4);
    user.findUnique.mockResolvedValueOnce({ id: 'existing-user', email: 'driver@example.com', password: verifiedHash });
    const signedInUser = await authorize({ email: 'driver@example.com', password: 'existing-password' }) as User;
    expect(signedInUser.passwordVersion).toBe(passwordVersion(verifiedHash));
    user.findUnique.mockResolvedValue({ password: 'reset-hash', passwordChangedAt: new Date() });
    await expect(jwt({}, signedInUser)).rejects.toThrow('Session expired');
  });

  it('revokes legacy JWTs issued before recovery and accepts later OAuth sign-ins', async () => {
    const changedAt = new Date('2026-10-18T12:00:00Z');
    user.findUnique.mockResolvedValue({ password: 'reset-hash', passwordChangedAt: changedAt });
    await expect(jwt({ id: 'existing-user', iat: changedAt.getTime() / 1000 - 60 })).rejects.toThrow('Session expired');
    await expect(jwt({ id: 'existing-user', authenticatedAt: changedAt.getTime() + 60_000 })).resolves.toMatchObject({ id: 'existing-user' });
  });

  it('preserves legacy sessions before any reset and rejects deleted accounts', async () => {
    user.findUnique.mockResolvedValueOnce({ password: 'old-hash', passwordChangedAt: null });
    await expect(jwt({ sub: 'existing-user', iat: 100 })).resolves.toMatchObject({ id: 'existing-user', authenticatedAt: 100_000 });
    user.findUnique.mockResolvedValueOnce(null);
    await expect(jwt({ id: 'deleted-user' })).rejects.toThrow('Session expired');
  });

  it('does not expose the password fingerprint through the session callback', async () => {
    const callback = (await options()).callbacks!.session!;
    const session = { user: { name: 'Driver', email: 'driver@example.com' }, expires: new Date().toISOString() };
    const result = await callback({ session, token: { id: 'existing-user', passwordVersion: 'private-fingerprint' } } as Parameters<typeof callback>[0]);
    expect(result.user).toMatchObject({ id: 'existing-user' });
    expect(JSON.stringify(result)).not.toContain('private-fingerprint');
  });
});
