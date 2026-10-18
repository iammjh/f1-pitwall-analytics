import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const bootstrap = readFileSync(new URL('../../docker/mongo/bootstrap.js', import.meta.url), 'utf8');
const healthcheck = readFileSync(new URL('../../docker/mongo/healthcheck.js', import.meta.url), 'utf8');

function runMongoScript(source: string, options: {
  initialized?: boolean;
  authenticationFails?: boolean;
  electionPolls?: number;
  set?: string;
} = {}) {
  let initialized = options.initialized ?? false;
  let electionPolls = options.electionPolls ?? 0;
  let exitCode = 0;
  const initiated: unknown[] = [];
  const authenticated: unknown[] = [];
  const logs: string[] = [];
  const quitSignal = new Error('quit');

  const admin = {
    auth(username: string, password: string) {
      authenticated.push([username, password]);
      if (options.authenticationFails) throw new Error('Authentication failed');
      return { ok: 1 };
    },
    runCommand(command: Record<string, unknown>) {
      if (command.replSetInitiate) {
        initiated.push(command.replSetInitiate);
        initialized = true;
        return { ok: 1 };
      }
      if (!initialized) throw { code: 94, codeName: 'NotYetInitialized' };
      const myState = electionPolls-- > 0 ? 2 : 1;
      return { ok: 1, set: options.set ?? 'rs0', myState };
    },
  };

  try {
    runInNewContext(source, {
      Mongo: class { getDB() { return admin; } },
      process: { env: { MONGO_INITDB_ROOT_USERNAME: 'test-user', MONGO_INITDB_ROOT_PASSWORD: 'test-secret' } },
      sleep: () => {},
      print: (message: string) => logs.push(message),
      quit(code: number) {
        exitCode = code;
        throw quitSignal;
      },
    });
  } catch (error) {
    if (error !== quitSignal) throw error;
  }
  return { exitCode, initiated, authenticated, logs };
}

describe('MongoDB replica-set bootstrap', () => {
  it('authenticates and initializes a fresh or existing standalone volume once', () => {
    const result = runMongoScript(bootstrap);
    expect(result.exitCode).toBe(0);
    expect(result.authenticated[0]).toEqual(['test-user', 'test-secret']);
    expect(result.initiated).toEqual([{ _id: 'rs0', members: [{ _id: 0, host: 'mongodb:27017' }] }]);
  });

  it('leaves an initialized replica set intact and waits for election', () => {
    const result = runMongoScript(bootstrap, { initialized: true, electionPolls: 2 });
    expect(result.exitCode).toBe(0);
    expect(result.initiated).toEqual([]);
    expect(result.authenticated).toHaveLength(3);
  });

  it('fails when authentication fails, without exposing credentials', () => {
    const result = runMongoScript(bootstrap, { authenticationFails: true });
    expect(result.exitCode).toBe(1);
    expect(result.initiated).toEqual([]);
    expect(result.logs.join(' ')).not.toContain('test-secret');
  });

  it('does not reconfigure an unexpected replica set', () => {
    const result = runMongoScript(bootstrap, { initialized: true, set: 'other-set' });
    expect(result.exitCode).toBe(1);
    expect(result.initiated).toEqual([]);
  });
});

describe('MongoDB healthcheck', () => {
  it('accepts an authenticated rs0 primary', () => {
    expect(runMongoScript(healthcheck, { initialized: true }).exitCode).toBe(0);
  });

  it('rejects standalone, unauthenticated, and non-primary instances', () => {
    expect(runMongoScript(healthcheck).exitCode).toBe(1);
    expect(runMongoScript(healthcheck, { initialized: true, authenticationFails: true }).exitCode).toBe(1);
    expect(runMongoScript(healthcheck, { initialized: true, electionPolls: 1 }).exitCode).toBe(1);
  });
});
