import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth-config';
import { getPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULTS = { emailNotifications: true, pushNotifications: false, notifyRaceStart: true };
const EDITABLE_FIELDS = ['emailNotifications', 'pushNotifications', 'notifyRaceStart'] as const;

async function requireUserId(): Promise<string | null> {
  const session = await getServerSession(getAuthOptions());
  return session?.user?.id ?? null;
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const prefs = await getPrisma().userPreferences.findUnique({
    where: { userId },
    select: { emailNotifications: true, pushNotifications: true, notifyRaceStart: true },
  });
  return NextResponse.json({ ...DEFAULTS, ...prefs });
}

export async function PUT(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const data: Partial<Record<(typeof EDITABLE_FIELDS)[number], boolean>> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'boolean') {
      return NextResponse.json({ error: `${field} must be true or false.` }, { status: 400 });
    }
    data[field] = body[field] as boolean;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const prefs = await getPrisma().userPreferences.upsert({
    where: { userId },
    update: data,
    create: { userId, ...DEFAULTS, ...data },
    select: { emailNotifications: true, pushNotifications: true, notifyRaceStart: true },
  });
  return NextResponse.json(prefs);
}
