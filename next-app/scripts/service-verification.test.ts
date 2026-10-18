import { describe, expect, it, vi } from 'vitest';
import { verificationFailed, verifyMongo, verifyOpenF1, verifyRedis } from './service-verification.mjs';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const sessions = [{ session_key: 9472 }];

function prisma(command: (command: Record<string, unknown>) => Promise<Record<string, unknown>> = async (command) => {
  if (command.hello) return { ok: 1, setName: 'rs0', isWritablePrimary: true };
  if (command.connectionStatus) return { ok: 1, authInfo: { authenticatedUsers: [{ user: 'app' }] } };
  return { ok: 1 };
}) {
  return { $runCommandRaw: vi.fn(command), $disconnect: vi.fn(async () => {}) };
}

describe('read-only service verification', () => {
  it('checks MongoDB authentication and primary status without database writes', async () => {
    const client = prisma();
    const create = vi.fn<(uri: string) => ReturnType<typeof prisma>>(() => client);
    expect(await verifyMongo({ MONGODB_URI: 'mongodb://app:secret@localhost/db?replicaSet=rs0' }, create)).toMatchObject({ status: 'healthy' });
    expect(client.$runCommandRaw.mock.calls.map(([command]) => command)).toEqual([{ ping: 1 }, { hello: 1 }, { connectionStatus: 1 }]);
    expect(create.mock.calls[0][0]).toContain('serverSelectionTimeoutMS=8000');
    expect(client.$disconnect).toHaveBeenCalledOnce();
  });

  it('accepts multi-host MongoDB URIs and retains their options', async () => {
    const create = vi.fn<(uri: string) => ReturnType<typeof prisma>>(() => prisma());
    await verifyMongo({ MONGODB_URI: 'mongodb://app:secret@one:27017,two:27017/db?replicaSet=rs0&authSource=admin' }, create);
    expect(create.mock.calls[0][0]).toContain('one:27017,two:27017/db?replicaSet=rs0&authSource=admin');
  });

  it('reports standalone and secondary MongoDB servers as misconfigured', async () => {
    for (const hello of [{ ok: 1, isWritablePrimary: true }, { ok: 1, setName: 'rs0', isWritablePrimary: false }]) {
      const client = prisma(vi.fn(async (command) => command.hello ? hello : { ok: 1 }));
      expect(await verifyMongo({ MONGODB_URI: 'mongodb://localhost/db' }, () => client)).toMatchObject({ status: 'misconfigured' });
      expect(client.$disconnect).toHaveBeenCalledOnce();
    }
  });

  it('does not report unauthenticated MongoDB as healthy', async () => {
    const client = prisma(vi.fn(async (command) => command.hello
      ? { ok: 1, setName: 'rs0', isWritablePrimary: true }
      : { ok: 1, authInfo: { authenticatedUsers: [] } }));
    expect(await verifyMongo({ MONGODB_URI: 'mongodb://localhost/db' }, () => client)).toMatchObject({ status: 'misconfigured' });
  });

  it('redacts MongoDB authentication failures and always disconnects', async () => {
    const client = prisma(vi.fn(async () => { throw Object.assign(new Error('mongodb://app:SECRET@host'), { code: 'P1000' }); }));
    const check = await verifyMongo({ MONGODB_URI: 'mongodb://app:SECRET@host/db' }, () => client);
    expect(check.status).toBe('denied');
    expect(JSON.stringify(check)).not.toContain('SECRET');
    expect(client.$disconnect).toHaveBeenCalledOnce();
  });

  it('distinguishes missing, placeholder, and invalid MongoDB configuration', async () => {
    const create = vi.fn();
    expect(await verifyMongo({}, create)).toMatchObject({ status: 'not-configured' });
    expect(await verifyMongo({ MONGODB_URI: 'mongodb://app:REPLACE_WITH_RANDOM_MONGO_PASSWORD@localhost/db' }, create)).toMatchObject({ status: 'misconfigured' });
    expect(await verifyMongo({ MONGODB_URI: 'https://localhost/db' }, create)).toMatchObject({ status: 'misconfigured' });
    expect(create).not.toHaveBeenCalled();
  });

  it('checks Redis using PING without altering the cache', async () => {
    const client = { on: vi.fn(), connect: vi.fn(async () => {}), ping: vi.fn(async () => 'PONG'), disconnect: vi.fn(async () => {}), isOpen: true };
    const create = vi.fn(() => client);
    expect(await verifyRedis({ REDIS_URL: 'redis://:secret@localhost' }, create)).toMatchObject({ status: 'healthy' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ socket: { connectTimeout: 8000, reconnectStrategy: false } }));
    expect(client.ping).toHaveBeenCalledOnce();
    expect(client.disconnect).toHaveBeenCalledOnce();
  });

  it('reports denied Redis authentication without exposing connection data', async () => {
    const client = { on: vi.fn(), connect: vi.fn(async () => { throw new Error('WRONGPASS redis://:SECRET@host'); }), isOpen: false };
    const check = await verifyRedis({ REDIS_URL: 'redis://:SECRET@host' }, () => client);
    expect(check.status).toBe('denied');
    expect(JSON.stringify(check)).not.toContain('SECRET');
  });

  it('rejects incomplete OpenF1 credentials before making a token request', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(sessions));
    const checks = await verifyOpenF1({ OPENF1_USERNAME: 'app' }, fetcher);
    expect(checks.map((check) => check.status)).toEqual(['healthy', 'misconfigured']);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('checks historical data separately when optional live credentials are absent', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(sessions));
    const checks = await verifyOpenF1({}, fetcher);
    expect(checks.map((check) => check.status)).toEqual(['healthy', 'not-configured']);
    expect(fetcher.mock.calls[0][0]).toContain('year=2024');
    expect(verificationFailed(checks)).toBe(false);
    expect(verificationFailed(checks, true)).toBe(true);
  });

  it('verifies provider token exchange and authenticated session access without logging tokens', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(sessions))
      .mockResolvedValueOnce(response({ access_token: 'SECRET_TOKEN' }))
      .mockResolvedValueOnce(response(sessions));
    const checks = await verifyOpenF1({ OPENF1_USERNAME: 'app', OPENF1_PASSWORD: 'SECRET_PASSWORD' }, fetcher);
    expect(checks.every((check) => check.status === 'healthy')).toBe(true);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST', body: 'username=app&password=SECRET_PASSWORD' });
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBe('Bearer SECRET_TOKEN');
    expect(JSON.stringify(checks)).not.toContain('SECRET');
  });

  it('reports authenticated provider denial separately from historical access', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(sessions)).mockResolvedValueOnce(response({}, 403));
    const checks = await verifyOpenF1({ OPENF1_USERNAME: 'app', OPENF1_PASSWORD: 'SECRET' }, fetcher);
    expect(checks.map((check) => check.status)).toEqual(['healthy', 'denied']);
    expect(verificationFailed(checks)).toBe(true);
  });

  it('classifies malformed provider responses and rate limits', async () => {
    const invalid = await verifyOpenF1({}, vi.fn(async () => response({ error: 'SECRET upstream body' })));
    expect(invalid[0].status).toBe('invalid-response');
    expect(JSON.stringify(invalid)).not.toContain('SECRET');
    const limited = await verifyOpenF1({}, vi.fn(async () => response({}, 429)));
    expect(limited[0].status).toBe('rate-limited');
  });

  it('redacts fetch exceptions containing private headers', async () => {
    const checks = await verifyOpenF1({ OPENF1_USERNAME: 'app', OPENF1_PASSWORD: 'SECRET' }, vi.fn(async () => { throw new Error('Authorization: Bearer SECRET'); }));
    expect(checks.every((check) => check.status === 'unreachable')).toBe(true);
    expect(JSON.stringify(checks)).not.toContain('SECRET');
  });
});
