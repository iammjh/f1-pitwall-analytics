import { NextResponse } from 'next/server';
import { f1Api } from '@/lib/f1-api';
import { OpenF1Error } from '@/lib/openf1-auth';
import { parseSeasonParam } from '@/lib/query-params';
import { enforcePublicRateLimit, publicCacheHeaders } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = enforcePublicRateLimit(request, 'sessions');
  if (limited) return limited;
  const season = parseSeasonParam(new URL(request.url).searchParams.get('season'));
  if (!season.ok) return NextResponse.json({ error: season.error }, { status: 400 });
  try {
    const response = await f1Api.sessions({ year: season.value });
    return NextResponse.json(Array.isArray(response.data) ? response.data : [], { headers: publicCacheHeaders(30, 0) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof OpenF1Error ? error.message : 'Could not load session data.',
        ...(error instanceof OpenF1Error ? { code: error.code } : {}) },
      { status: error instanceof OpenF1Error ? error.status : 502 },
    );
  }
}
