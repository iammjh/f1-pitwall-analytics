import { createClient } from 'redis';
import { getRedisUrl } from '@/lib/redis-config';

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connecting: Promise<RedisClient> | null = null;

/**
 * Shared Redis client. A failed connection rejects and is not cached, so the next call retries.
 * Callers that treat Redis as optional should catch the rejection.
 */
export const getRedis = (): Promise<RedisClient> => {
  if (client?.isOpen) return Promise.resolve(client);

  if (!connecting) {
    // No automatic retries: an unreachable Redis should reject quickly so callers can fall back.
    // getRedis() opens a new client on the next call once this one has closed.
    const next = createClient({
      url: getRedisUrl(),
      socket: { connectTimeout: 3000, reconnectStrategy: false },
    });
    next.on('error', (err) => console.log('Redis Client Error', err));
    connecting = next
      .connect()
      .then(() => {
        client = next;
        return next;
      })
      .finally(() => {
        connecting = null;
      });
  }
  return connecting;
};

export const cacheKey = {
  races: (season: number) => `races:${season}`,
  race: (season: number, round: number) => `race:${season}:${round}`,
  results: (season: number, round: number) => `results:${season}:${round}`,
  telemetry: (raceId: number) => `telemetry:${raceId}`,
  standings: (season: number) => `standings:${season}`,
};
