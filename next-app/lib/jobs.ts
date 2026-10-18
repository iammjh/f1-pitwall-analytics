/**
 * Background job queues (Bull + Redis).
 *
 * Disabled by default. Set BACKGROUND_JOBS_ENABLED=true in next-app/.env.local
 * to start recurring race/telemetry sync on the Next.js server process.
 */
import Queue from 'bull';
import { getRedis } from '@/lib/redis';
import { getRedisUrl } from '@/lib/redis-config';
import { f1Api } from '@/lib/f1-api';
import { getPrisma } from '@/lib/prisma';
import type { OpenF1Session } from '@/lib/live-telemetry';
import { selectPreferredSession } from '@/lib/live-telemetry';
import { resolveSyncSeason, syncRaceSchedules } from '@/lib/race-sync';

const redisUrl = getRedisUrl();

export const raceSyncQueue = new Queue('race-sync', { redis: redisUrl });
export const telemetrySyncQueue = new Queue('telemetry-sync', { redis: redisUrl });

const RACE_SYNC_MS = 60 * 60 * 1000;
const TELEMETRY_SYNC_MS = 30_000;

async function resolveTelemetrySession(season: number): Promise<OpenF1Session | null> {
  const res = await f1Api.sessions({ year: season });
  const sessions = Array.isArray(res.data) ? (res.data as OpenF1Session[]) : [];
  return selectPreferredSession(sessions, {
    preferRace: false,
    allowScheduledFallback: true,
  });
}

raceSyncQueue.process(async (job) => {
  const season = resolveSyncSeason(job.data.season, { recurring: Boolean(job.opts.repeat) });
  const prisma = getPrisma();

  try {
    const res = await f1Api.races(season);
    const races = res.data.MRData.RaceTable.Races;

    if (!Array.isArray(races)) {
      throw new Error('Race sync received an invalid race schedule');
    }
    const processed = await syncRaceSchedules(races, season, prisma.race);

    const redis = await getRedis();
    await redis.setEx(`races:${season}`, 3600, JSON.stringify(races));

    return { processed };
  } catch (error) {
    console.error('Race sync failed:', error);
    throw error;
  }
});

telemetrySyncQueue.process(async (job) => {
  const season = resolveSyncSeason(job.data.season, { recurring: Boolean(job.opts.repeat) });
  const session = await resolveTelemetrySession(season);

  if (!session?.session_key) {
    return { skipped: true, reason: 'no-active-session' };
  }

  const redis = await getRedis();
  await redis.setEx(
    `telemetry:${session.session_key}`,
    300,
    JSON.stringify(session),
  );

  return { session_key: session.session_key, cached: true };
});

export async function scheduleJobs() {
  if (process.env.BACKGROUND_JOBS_ENABLED !== 'true') {
    return false;
  }

  await raceSyncQueue.add({}, { repeat: { every: RACE_SYNC_MS } });
  await telemetrySyncQueue.add({}, { repeat: { every: TELEMETRY_SYNC_MS } });

  console.log('[jobs] Background sync enabled (race + telemetry queues scheduled)');
  return true;
}
