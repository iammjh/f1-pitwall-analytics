import axios from 'axios';

export class OpenF1Error extends Error {
  constructor(message: string, public readonly code: string, public readonly status = 503) {
    super(message);
    this.name = 'OpenF1Error';
  }
}

type CachedToken = { value: string; expiresAt: number; credentials: string };
let cachedToken: CachedToken | null = null;
let tokenRequest: Promise<string> | null = null;

export function hasOpenF1Credentials() {
  return Boolean(process.env.OPENF1_USERNAME?.trim() && process.env.OPENF1_PASSWORD);
}

export function invalidateOpenF1Token() {
  cachedToken = null;
}

export async function getOpenF1AccessToken(): Promise<string | null> {
  const username = process.env.OPENF1_USERNAME?.trim();
  const password = process.env.OPENF1_PASSWORD;
  if (!username && !password) return null;
  if (!username || !password) {
    throw new OpenF1Error('OpenF1 live access is not configured completely.', 'OPENF1_CONFIGURATION');
  }

  const credentials = JSON.stringify([username, password]);
  if (cachedToken?.credentials === credentials && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }
  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    try {
      const response = await axios.post('https://api.openf1.org/token',
        new URLSearchParams({ username, password }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000 },
      );
      const value = response.data?.access_token;
      const expiresIn = Number(response.data?.expires_in ?? 3600);
      if (typeof value !== 'string' || !value.trim() || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new Error('Invalid token response');
      }
      // Refresh early; never extend a short-lived token beyond its actual expiry.
      cachedToken = {
        value,
        expiresAt: Date.now() + Math.max(0, expiresIn * 1000 - Math.min(60_000, expiresIn * 100)),
        credentials,
      };
      return value;
    } catch {
      // Axios errors contain request bodies/headers. Do not expose or log those credentials.
      throw new OpenF1Error('OpenF1 authentication failed. Check the server credentials and subscription.', 'OPENF1_AUTH_FAILED');
    }
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

export function normalizeOpenF1Error(error: unknown): OpenF1Error {
  if (error instanceof OpenF1Error) return error;
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 401 || status === 403) {
    return new OpenF1Error(
      hasOpenF1Credentials()
        ? 'OpenF1 live access was denied. Check the server credentials and subscription.'
        : 'Live OpenF1 data requires configured server credentials and an active subscription. Historical data remains available.',
      'OPENF1_ACCESS_REQUIRED',
    );
  }
  return new OpenF1Error(
    status === 429 ? 'OpenF1 is temporarily rate limited. Please try again shortly.' : 'OpenF1 data is temporarily unavailable. Please try again shortly.',
    status === 429 ? 'OPENF1_RATE_LIMITED' : 'OPENF1_UNAVAILABLE',
    status === 429 ? 503 : 502,
  );
}
