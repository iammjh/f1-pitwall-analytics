import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth-config';
import { getPrisma } from '@/lib/prisma';
import { validateWatchlistInput } from '@/lib/watchlist-validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: { id: string } };

// ─── PUT /api/watchlist/[id] ───────────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const prisma = getPrisma();
    // Ownership check — prevent users editing other users' watchlists
    const existing = await prisma.watchlist.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
    }
    const result = validateWatchlistInput(body, 'update');
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    const updated = await prisma.watchlist.update({
      where: { id: params.id },
      data: result.value,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[watchlist PUT]', error);
    return NextResponse.json(
      { error: 'Failed to update watchlist' },
      { status: 500 },
    );
  }
}

// ─── DELETE /api/watchlist/[id] ───────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const prisma = getPrisma();
    // Ownership check
    const existing = await prisma.watchlist.findUnique({
      where:  { id: params.id },
      select: { userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.watchlist.delete({ where: { id: params.id } });
    return NextResponse.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('[watchlist DELETE]', error);
    return NextResponse.json(
      { error: 'Failed to delete watchlist' },
      { status: 500 },
    );
  }
}
