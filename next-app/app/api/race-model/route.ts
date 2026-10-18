import { NextRequest, NextResponse } from 'next/server';
import { fetchPagedRaces } from '@/lib/jolpica-fetch';
import artifactJson from '@/lib/models/podium-model.json';
import { buildFeatureRows, featureValues, predictLogistic, toRaceRecord, type PodiumModelArtifact } from '@/lib/podium-model';
import { createTtlCache, enforcePublicRateLimit, publicCacheHeaders } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

const artifact = artifactJson as unknown as PodiumModelArtifact;
const MODEL_FIRST_SEASON = 2014; // the model was trained from 2014, the hybrid era
const CACHE_MS = 60 * 60 * 1000;
const modelCache = createTtlCache<object>(CACHE_MS);

/**
 * Podium chance for every driver in a completed race, from the grid and the form going into it.
 * Races in the test season use the model that never saw that season, so those scores are out-of-sample.
 */
export async function GET(req: NextRequest) {
  const limited = enforcePublicRateLimit(req, 'race-model');
  if (limited) return limited;

  const season = Number(req.nextUrl.searchParams.get('season'));
  const round = Number(req.nextUrl.searchParams.get('round'));
  const maxSeason = new Date().getFullYear() + 1;
  if (!Number.isInteger(season) || season < MODEL_FIRST_SEASON || season > maxSeason) {
    return NextResponse.json({ error: `season must be between ${MODEL_FIRST_SEASON} and ${maxSeason}.` }, { status: 400 });
  }
  if (!Number.isInteger(round) || round < 1 || round > 30) {
    return NextResponse.json({ error: 'round must be a whole number from 1 to 30.' }, { status: 400 });
  }

  const key = `${season}:${round}`;
  const cached = modelCache.get(key);
  if (cached) return NextResponse.json(cached, { headers: publicCacheHeaders(CACHE_MS / 1000) });

  try {
    // Form needs the races before this one, so the previous season is loaded as well.
    const [previous, current] = await Promise.all([fetchPagedRaces(String(season - 1)), fetchPagedRaces(String(season))]);
    const target = current.find((r: any) => Number(r.round) === round);
    if (!target?.Results?.length) {
      return NextResponse.json({ error: 'That race has no results yet, so there is nothing to score.' }, { status: 404 });
    }

    const records = [...previous, ...current].map((r: any) => toRaceRecord(r, Number(r.season)));
    const rows = buildFeatureRows(records).filter((r) => r.season === season && r.round === round);
    const outOfSample = season === artifact.evaluation.testSeason;
    const model = outOfSample ? artifact.holdoutModel : artifact.model;
    const names = new Map(
      target.Results.map((res: any) => [
        res.Driver?.driverId,
        {
          name: [res.Driver?.givenName, res.Driver?.familyName].filter(Boolean).join(' '),
          code: res.Driver?.code ?? null,
          constructorName: res.Constructor?.name ?? null,
        },
      ]),
    );

    const drivers = rows
      .map((row) => ({
        driverId: row.driverId,
        ...(names.get(row.driverId) ?? { name: row.driverId, code: null, constructorName: null }),
        grid: row.grid,
        formAvg: Math.round(row.formAvg * 100) / 100,
        teamForm: Math.round(row.teamForm * 100) / 100,
        probability: Math.round(predictLogistic(model, featureValues(row, artifact.features)) * 1000) / 1000,
        finish: row.finish,
        podium: row.podium === 1,
      }))
      .sort((a, b) => b.probability - a.probability);

    const payload = {
      available: true,
      season,
      round,
      raceName: target.raceName,
      sample: outOfSample
        ? { outOfSample: true, note: `Out of sample: the model was trained on ${artifact.evaluation.trainSeasons}, not on this season.` }
        : { outOfSample: false, note: `In sample: this season is part of the training data (through ${artifact.trainedThrough.season} round ${artifact.trainedThrough.round}).` },
      evaluation: artifact.evaluation,
      latestSeasonCheck: artifact.latestSeasonCheck,
      drivers,
    };
    modelCache.set(key, payload);
    return NextResponse.json(payload, { headers: publicCacheHeaders(CACHE_MS / 1000) });
  } catch (error) {
    console.error('Race model error:', error);
    return NextResponse.json({ error: 'Could not score this race right now.' }, { status: 502 });
  }
}
