import { NextRequest, NextResponse } from 'next/server';
import {
  flattenRaceResults,
  summarizeConstructorCareer,
  summarizeDriverCareer,
  type CareerResult,
} from '@/lib/career';
import { createTtlCache, enforcePublicRateLimit, publicCacheHeaders } from '@/lib/public-api';
import { fetchPagedRaces, getJolpicaJson } from '@/lib/jolpica-fetch';

export const dynamic = 'force-dynamic';

const ID_PATTERN = /^[a-z0-9_-]{2,40}$/;
const CACHE_MS = 60 * 60 * 1000;
const careerCache = createTtlCache<object>(CACHE_MS);

function json(payload: object, cacheSeconds: number) {
  return NextResponse.json(payload, { headers: publicCacheHeaders(cacheSeconds) });
}

export async function GET(req: NextRequest) {
  const limited = enforcePublicRateLimit(req, 'career');
  if (limited) return limited;

  const type = req.nextUrl.searchParams.get('type');
  const id = (req.nextUrl.searchParams.get('id') ?? '').trim().toLowerCase();
  if (type !== 'driver' && type !== 'constructor') {
    return NextResponse.json({ error: 'type must be "driver" or "constructor".' }, { status: 400 });
  }
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  }

  const key = `${type}:${id}`;
  const cached = careerCache.get(key);
  if (cached) return json(cached, CACHE_MS / 1000);

  try {
    const path = type === 'driver' ? `drivers/${id}` : `constructors/${id}`;
    const [detail, races] = await Promise.all([getJolpicaJson(`${path}.json`), fetchPagedRaces(path)]);

    let info: Record<string, unknown> | undefined;
    let rows: CareerResult[];
    if (type === 'driver') {
      const driver = detail?.MRData?.DriverTable?.Drivers?.[0];
      if (!driver) return NextResponse.json({ error: 'Unknown driver.' }, { status: 404 });
      info = {
        driverId: driver.driverId,
        name: [driver.givenName, driver.familyName].filter(Boolean).join(' '),
        dateOfBirth: driver.dateOfBirth ?? null,
        nationality: driver.nationality ?? null,
        permanentNumber: driver.permanentNumber ?? null,
        code: driver.code ?? null,
        url: driver.url ?? null,
      };
      rows = flattenRaceResults(races).filter((row) => row.driverId === id);
    } else {
      const team = detail?.MRData?.ConstructorTable?.Constructors?.[0];
      if (!team) return NextResponse.json({ error: 'Unknown constructor.' }, { status: 404 });
      info = {
        constructorId: team.constructorId,
        name: team.name,
        nationality: team.nationality ?? null,
        url: team.url ?? null,
      };
      rows = flattenRaceResults(races).filter((row) => row.constructorId === id);
    }

    const career = type === 'driver' ? summarizeDriverCareer(rows) : summarizeConstructorCareer(rows);
    const payload = { type, info, ...career };
    careerCache.set(key, payload);
    return json(payload, CACHE_MS / 1000);
  } catch (error) {
    console.error('Career API error:', error);
    return NextResponse.json({ error: 'Could not load career data right now.' }, { status: 502 });
  }
}
