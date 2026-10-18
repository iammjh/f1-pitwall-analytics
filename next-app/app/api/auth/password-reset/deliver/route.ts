import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { processPasswordResetDeliveries } from '@/lib/password-reset-delivery';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: 'Recovery delivery is not configured.' }, { status: 503, headers });
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get('authorization') ?? '');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  }
  try {
    const summary = await processPasswordResetDeliveries(getPrisma());
    return NextResponse.json(summary, { status: summary.skipped ? 503 : 200, headers });
  } catch {
    return NextResponse.json({ error: 'Recovery delivery is temporarily unavailable.' }, { status: 503, headers });
  }
}

export const POST = GET;
