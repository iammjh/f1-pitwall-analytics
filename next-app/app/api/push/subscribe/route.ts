import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth-config';
import { getPrisma } from '@/lib/prisma';
import { isPushConfigured, parsePushSubscription } from '@/lib/push';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function requireUserId(): Promise<string | null> {
  const session = await getServerSession(getAuthOptions());
  return session?.user?.id ?? null;
}

/** Stores this browser's push subscription for the signed-in user. */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isPushConfigured()) {
    return NextResponse.json({ error: 'Push notifications are not configured on this server.' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }
  const target = parsePushSubscription(body);
  if (!target) return NextResponse.json({ error: 'Invalid push subscription.' }, { status: 400 });

  // Endpoints are unique per browser; a re-subscribe from the same browser moves it to the current user.
  await getPrisma().pushSubscription.upsert({
    where: { endpoint: target.endpoint },
    update: { userId, p256dh: target.p256dh, auth: target.auth },
    create: { userId, ...target },
  });
  return NextResponse.json({ ok: true });
}

/** Removes one of this user's subscriptions, for example when push is turned off on this device. */
export async function DELETE(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let endpoint: unknown;
  try {
    endpoint = (await req.json())?.endpoint;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }
  if (typeof endpoint !== 'string') return NextResponse.json({ error: 'endpoint is required.' }, { status: 400 });

  await getPrisma().pushSubscription.deleteMany({ where: { endpoint, userId } });
  return NextResponse.json({ ok: true });
}
