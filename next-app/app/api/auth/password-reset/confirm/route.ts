import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { clientIpFromHeaders, hitRateLimit } from '@/lib/rate-limit';
import { confirmPasswordReset, INVALID_RESET_MESSAGE } from '@/lib/password-reset';
import { validatePassword } from '@/lib/password-validation';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const limit = hitRateLimit(`reset-confirm:${clientIpFromHeaders(request.headers)}`, { limit: 15, windowMs: 15 * 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSec) } });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers }); }
  const password = validatePassword(body?.password, true);
  if (!password.ok) return NextResponse.json({ error: password.error }, { status: 400, headers });
  if (body?.confirmation !== password.value) return NextResponse.json({ error: 'Passwords must match.' }, { status: 400, headers });
  try {
    const changed = await confirmPasswordReset(getPrisma(), body?.token, password.value);
    return NextResponse.json(changed ? { message: 'Password changed. Sign in with your new password.' } : { error: INVALID_RESET_MESSAGE }, { status: changed ? 200 : 400, headers });
  } catch {
    return NextResponse.json({ error: 'Password recovery is temporarily unavailable. Please try again shortly.' }, { status: 503, headers });
  }
}
