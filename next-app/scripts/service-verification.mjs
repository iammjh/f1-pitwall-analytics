const TIMEOUT_MS = 8_000;
const result = (service, status, message) => ({ service, status, message });
const placeholder = (value) => /REPLACE_WITH|YOUR_(?:MONGO|REDIS|OPENF1)|change-me/i.test(value);

function networkFailure(service, error) {
  if (error?.code === 'ECONNREFUSED') {
    return result(service, 'unreachable', 'Connection was refused. Start the service at its configured address and retry.');
  }
  if (error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') {
    return result(service, 'unreachable', 'The configured service hostname could not be resolved. Check DNS and configuration.');
  }
  return result(service, 'unreachable', 'Connection failed or timed out. Check that the service is running and reachable from this host.');
}

function deadline(promise) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS); }),
  ]).finally(() => clearTimeout(timer));
}

/** Read-only commands: never create collections, accounts, or change replica-set topology. */
export async function verifyMongo(env, createPrisma) {
  const service = 'MongoDB';
  const uri = env.MONGODB_URI?.trim();
  if (!uri) return result(service, 'not-configured', 'Set MONGODB_URI in next-app/.env.local or the hosting environment.');
  if (placeholder(uri)) return result(service, 'misconfigured', 'Replace the MONGODB_URI template values with real configuration.');
  let client;
  try {
    if (!/^mongodb(?:\+srv)?:\/\//.test(uri)) {
      return result(service, 'misconfigured', 'MONGODB_URI must use mongodb:// or mongodb+srv://.');
    }
    // WHATWG URL rejects valid MongoDB URIs containing multiple seed hosts.
    const [address, query = ''] = uri.split('?');
    const params = new URLSearchParams(query);
    params.set('serverSelectionTimeoutMS', String(TIMEOUT_MS));
    params.set('connectTimeoutMS', String(TIMEOUT_MS));
    client = createPrisma(`${address}?${params}`);
    const ping = await deadline(client.$runCommandRaw({ ping: 1 }));
    if (ping.ok !== 1) return result(service, 'invalid-response', 'MongoDB did not acknowledge its ping.');
    const hello = await deadline(client.$runCommandRaw({ hello: 1 }));
    if (!hello.setName || !hello.isWritablePrimary) {
      return result(service, 'misconfigured', 'MongoDB is reachable but is not a writable replica-set primary. Initialize the replica set before running Prisma writes.');
    }
    const connection = await deadline(client.$runCommandRaw({ connectionStatus: 1 }));
    if (!connection.authInfo?.authenticatedUsers?.length) {
      return result(service, 'misconfigured', 'MongoDB is reachable without an authenticated database user. Configure database authentication before using this deployment.');
    }
    return result(service, 'healthy', 'Authenticated ping and writable replica-set primary verified. Database contents were not changed.');
  } catch (error) {
    // Driver errors can contain complete connection strings. Return only fixed diagnostics.
    if (error instanceof TypeError || error?.code === 'P1013') {
      return result(service, 'misconfigured', 'MONGODB_URI is invalid. Check its format and percent-encoded credentials.');
    }
    if (error?.code === 'P1000' || String(error?.meta?.code) === '18') {
      return result(service, 'denied', 'MongoDB authentication failed. Check credentials and authSource.');
    }
    return networkFailure(service, error);
  } finally {
    if (client) await client.$disconnect().catch(() => {});
  }
}

export async function verifyRedis(env, createRedis) {
  const service = 'Redis';
  const uri = env.REDIS_URL?.trim();
  if (!uri) return result(service, 'not-configured', 'Set REDIS_URL in next-app/.env.local or the hosting environment.');
  if (placeholder(uri)) return result(service, 'misconfigured', 'Replace the REDIS_URL template values with real configuration.');
  let client;
  try {
    if (!['redis:', 'rediss:'].includes(new URL(uri).protocol)) {
      return result(service, 'misconfigured', 'REDIS_URL must use redis:// or rediss://.');
    }
    client = createRedis({ url: uri, socket: { connectTimeout: TIMEOUT_MS, reconnectStrategy: false } });
    client.on('error', () => {}); // Never let a driver error expose a credential-bearing URL.
    await deadline(client.connect());
    if (await deadline(client.ping()) !== 'PONG') return result(service, 'invalid-response', 'Redis did not acknowledge its ping.');
    return result(service, 'healthy', 'Connection and PING verified. Cache contents were not changed.');
  } catch (error) {
    if (error instanceof TypeError) return result(service, 'misconfigured', 'REDIS_URL is invalid. Check its format and percent-encoded credentials.');
    if (/WRONGPASS|NOAUTH|NOPERM/.test(String(error?.message))) {
      return result(service, 'denied', 'Redis authentication or PING permission was denied. Check credentials and ACL configuration.');
    }
    return networkFailure(service, error);
  } finally {
    if (client?.isOpen) await client.disconnect().catch(() => {});
  }
}

function responseFailure(service, status) {
  if (status === 401 || status === 403) return result(service, 'denied', 'OpenF1 access was denied. Check provider credentials and subscription access.');
  if (status === 429) return result(service, 'rate-limited', 'OpenF1 is rate limited. Retry after the provider limit resets.');
  return result(service, 'unreachable', `OpenF1 returned HTTP ${Number.isInteger(status) ? status : 'error'}. Retry when the provider is available.`);
}

async function readSessions(service, fetchImpl, token, latest) {
  const response = await fetchImpl(`https://api.openf1.org/v1/sessions?${latest ? 'session_key=latest' : 'year=2024&country_name=Bahrain&session_name=Race'}`, {
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return responseFailure(service, response.status);
  const sessions = await response.json();
  if (!Array.isArray(sessions) || !sessions.length || sessions.some((session) => !Number.isInteger(session?.session_key))) {
    return result(service, 'invalid-response', 'OpenF1 returned no valid session metadata.');
  }
  return result(service, 'healthy', latest
    ? 'Provider token exchange and authenticated latest-session metadata verified. Live sample availability depends on the race schedule.'
    : 'Public historical session metadata verified.');
}

/** No credentials, bearer tokens, upstream bodies, or connection URLs are returned. */
export async function verifyOpenF1(env, fetchImpl = fetch) {
  let historical;
  try {
    historical = await readSessions('OpenF1 historical', fetchImpl, null, false);
  } catch {
    historical = networkFailure('OpenF1 historical');
  }
  const service = 'OpenF1 live';
  const username = env.OPENF1_USERNAME?.trim();
  const password = env.OPENF1_PASSWORD;
  if (!username && !password) {
    return [historical, result(service, 'not-configured', 'Optional live access needs OPENF1_USERNAME, OPENF1_PASSWORD, and provider subscription access. Historical access is checked separately.')];
  }
  if (!username || !password || placeholder(username) || placeholder(password)) {
    return [historical, result(service, 'misconfigured', 'Set both OPENF1_USERNAME and OPENF1_PASSWORD to valid provider credentials.')];
  }
  try {
    const response = await fetchImpl('https://api.openf1.org/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ username, password }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return [historical, responseFailure(service, response.status)];
    const token = await response.json();
    if (typeof token?.access_token !== 'string' || !token.access_token.trim()) {
      return [historical, result(service, 'invalid-response', 'OpenF1 returned an invalid token response.')];
    }
    return [historical, await readSessions(service, fetchImpl, token.access_token, true)];
  } catch {
    return [historical, networkFailure(service)];
  }
}

export function verificationFailed(checks, requireLive = false) {
  return checks.some((check) => check.status !== 'healthy'
    && !(check.service === 'OpenF1 live' && check.status === 'not-configured' && !requireLive));
}
