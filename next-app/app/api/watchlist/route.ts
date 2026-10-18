import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth-config';
import { getPrisma } from '@/lib/prisma';
import { validateWatchlistInput } from '@/lib/watchlist-validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ─── GET /api/watchlist ────────────────────────────────────────────────────────
export async function GET(_req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const prisma = getPrisma();
    const watchlists = await prisma.watchlist.findMany({
      where:   { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    });
    // drivers / teams / races are now String[] — no JSON.parse needed
    return NextResponse.json(watchlists);
  } catch (error) {
    console.error('[watchlist GET]', error);
    return NextResponse.json(
      { error: 'Failed to fetch watchlists' },
      { status: 500 },
    );
  }
}

// ─── POST /api/watchlist ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
    }
    const result = validateWatchlistInput(body, 'create');
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    const prisma = getPrisma();
    const watchlist = await prisma.watchlist.create({
      data: {
        ...result.value,
        name: result.value.name!,
        userId: session.user.id,
      },
    });

    return NextResponse.json(watchlist, { status: 201 });
  } catch (error) {
    console.error('[watchlist POST]', error);
    return NextResponse.json(
      { error: 'Failed to create watchlist' },
      { status: 500 },
    );
  }
}
