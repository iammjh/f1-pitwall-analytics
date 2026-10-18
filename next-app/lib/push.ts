import webpush from 'web-push';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export type PushResult = { sent: true } | { sent: false; gone: boolean; error?: string };

export function getVapidPublicKey(env: Record<string, string | undefined> = process.env): string | null {
  return env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

export function isPushConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(getVapidPublicKey(env) && env.VAPID_PRIVATE_KEY?.trim());
}

/** Validates a browser PushSubscription JSON before it is stored. */
export function parsePushSubscription(value: unknown): PushTarget | null {
  if (!value || typeof value !== 'object') return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 2048) return null;
  if (typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') return null;
  if (!keys.p256dh || !keys.auth) return null;
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

let configured = false;

/** Sends one notification. A 404/410 from the push service means the subscription is gone. */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushResult> {
  if (!isPushConfigured()) return { sent: false, gone: false, error: 'Push is not configured' };
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT?.trim() || 'https://pitwall-analytics.vercel.app',
      getVapidPublicKey() as string,
      process.env.VAPID_PRIVATE_KEY as string,
    );
    configured = true;
  }

  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 },
    );
    return { sent: true };
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    return {
      sent: false,
      gone: status === 404 || status === 410,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
