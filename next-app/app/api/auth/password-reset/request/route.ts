import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { isMailConfigured } from '@/lib/mailer';
import { clientIpFromHeaders, hitRateLimit } from '@/lib/rate-limit';
import { passwordResetOrigin, enqueuePasswordReset, RESET_ACCEPTED_MESSAGE } from '@/lib/password-reset';

export const dynamic = 'force-dynamic';
const privateHeaders = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const ip = hitRateLimit(`reset-request:${clientIpFromHeaders(request.headers)}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!ip.allowed) return NextResponse.json({ error: 'Too many recovery requests. Please try again later.' }, { status: 429, headers: { ...privateHeaders, 'Retry-After': String(ip.retryAfterSec) } });
  let email: string;
  try {
    const body = await request.json();
    if (typeof body?.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email.trim())) throw new Error();
    email = body.email.trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400, headers: privateHeaders });
  }
  try {
    if (!isMailConfigured() || !process.env.CRON_SECRET?.trim()) throw new Error();
    passwordResetOrigin();
  } catch {
    return NextResponse.json({ error: 'Email recovery is currently unavailable. Please contact the site administrator.' }, { status: 503, headers: privateHeaders });
  }
  const accountLimit = hitRateLimit(`reset-email:${email}`, { limit: 3, windowMs: 60 * 60_000 });
  if (accountLimit.allowed) {
    try {
      await enqueuePasswordReset(getPrisma(), email);
    } catch {
      // Do not expose account existence, SMTP details, or token data.
      console.error('Password recovery request could not be processed.');
      return NextResponse.json({ error: 'Email recovery is temporarily unavailable. Please try again shortly.' }, { status: 503, headers: privateHeaders });
    }
  }
  return NextResponse.json({ message: RESET_ACCEPTED_MESSAGE }, { status: 202, headers: privateHeaders });
}
