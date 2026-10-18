import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError } from 'axios';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('OPENF1_USERNAME', '');
  vi.stubEnv('OPENF1_PASSWORD', '');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

function credentials() {
  vi.stubEnv('OPENF1_USERNAME', 'api-user');
  vi.stubEnv('OPENF1_PASSWORD', 'server-secret');
}

describe('OpenF1 server authentication', () => {
  it('keeps unauthenticated historical access available', async () => {
    const post = vi.spyOn(axios, 'post');
    const { openF1, f1Api } = await import('./f1-api');
    const adapter = vi.fn(async (config) => ({ data: [], status: 200, statusText: 'OK', headers: {}, config }));
    openF1.defaults.adapter = adapter;
    await f1Api.sessions({ year: 2024 });
    expect(adapter.mock.calls[0][0].headers.get('Authorization')).toBeUndefined();
    expect(post).not.toHaveBeenCalled();
  });

  it('shares token acquisition, sends form data, and refreshes before expiry', async () => {
    credentials();
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'private-token', expires_in: '3600' } });
    const { getOpenF1AccessToken } = await import('./openf1-auth');
    expect(await Promise.all([getOpenF1AccessToken(), getOpenF1AccessToken(), getOpenF1AccessToken()])).toEqual(Array(3).fill('private-token'));
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, options] = post.mock.calls[0];
    expect(url).toBe('https://api.openf1.org/token');
    expect(new URLSearchParams(body as string).get('username')).toBe('api-user');
    expect(options?.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded');
    vi.setSystemTime(new Date('2026-10-18T12:59:30Z'));
    await getOpenF1AccessToken();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('attaches the token only to server requests and retries an expired token once', async () => {
    credentials();
    const post = vi.spyOn(axios, 'post')
      .mockResolvedValueOnce({ data: { access_token: 'old-token', expires_in: 3600 } })
      .mockResolvedValueOnce({ data: { access_token: 'renewed-token', expires_in: 3600 } });
    const { openF1, f1Api } = await import('./f1-api');
    const authorizations: unknown[] = [];
    openF1.defaults.adapter = async config => {
      authorizations.push(config.headers.get('Authorization'));
      if (authorizations.length === 1) {
        throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null,
          { data: {}, status: 401, statusText: 'Unauthorized', headers: {}, config });
      }
      return { data: [], status: 200, statusText: 'OK', headers: {}, config };
    };
    await f1Api.sessions({ year: 2026 });
    expect(authorizations).toEqual(['Bearer old-token', 'Bearer renewed-token']);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('does not expose credentials or enter an authentication retry loop', async () => {
    credentials();
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'private-token', expires_in: 3600 } });
    const { openF1, f1Api } = await import('./f1-api');
    let attempts = 0;
    openF1.defaults.adapter = async config => {
      attempts++;
      throw new AxiosError('Contains private-token server-secret', 'ERR_BAD_REQUEST', config, null,
        { data: {}, status: 401, statusText: 'Unauthorized', headers: {}, config });
    };
    const error = await f1Api.sessions({ year: 2026 }).catch(error => error);
    expect(error.code).toBe('OPENF1_ACCESS_REQUIRED');
    expect(attempts).toBe(2); expect(post).toHaveBeenCalledTimes(2);
    expect(String(error) + JSON.stringify(error)).not.toMatch(/private-token|server-secret/);
  });

  it('reports incomplete credentials and sanitizes token endpoint failures', async () => {
    vi.stubEnv('OPENF1_USERNAME', 'api-user');
    const { getOpenF1AccessToken } = await import('./openf1-auth');
    await expect(getOpenF1AccessToken()).rejects.toMatchObject({ code: 'OPENF1_CONFIGURATION' });
    vi.stubEnv('OPENF1_PASSWORD', 'server-secret');
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('raw failure containing server-secret'));
    const error = await getOpenF1AccessToken().catch(error => error);
    expect(error.code).toBe('OPENF1_AUTH_FAILED');
    expect(String(error)).not.toContain('server-secret');
  });
});
