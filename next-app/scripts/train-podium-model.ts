// Trains the podium model from Jolpica results and writes lib/models/podium-model.json.
// The shipped model uses the grid slot only. Form and team points are scored alongside it, so the
// evidence for keeping them out stays visible.
// Run: node --experimental-strip-types scripts/train-podium-model.ts
import { writeFileSync } from 'node:fs';
import {
  buildFeatureRows,
  evaluatePodiumModel,
  fitLogistic,
  FEATURE_NAMES,
  featureValues,
  toRaceRecord,
  type FeatureRow,
  type RaceRecord,
} from '../lib/podium-model.ts';

const JOLPICA = process.env.ERGAST_API || 'https://api.jolpi.ca/ergast/f1';
const FIRST_SEASON = 2013; // one season before the training window, so early rows have form history
const TRAIN_FROM = 2014; // the hybrid era: cars and points systems stop changing season to season
const SHIPPED_FEATURES = ['grid'] as const;

async function getJson(path: string): Promise<any> {
  await new Promise((r) => setTimeout(r, 800)); // pace requests so Jolpica does not rate-limit the run
  for (let attempt = 1; attempt <= 8; attempt++) {
    const res = await fetch(`${JOLPICA}/${path}`, { headers: { Accept: 'application/json' } });
    if (res.ok) return res.json();
    if (res.status !== 429 && res.status < 500) throw new Error(`Jolpica ${res.status} for ${path}`);
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
  throw new Error(`Jolpica kept failing for ${path}`);
}

async function seasonRaces(season: number): Promise<RaceRecord[]> {
  const races: RaceRecord[] = [];
  const pageSize = 100;
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const data = await getJson(`${season}/results.json?limit=${pageSize}&offset=${offset}`);
    total = Number(data?.MRData?.total ?? 0);
    const page = data?.MRData?.RaceTable?.Races ?? [];
    if (!page.length) break;
    for (const r of page) races.push(toRaceRecord(r, season));
    offset += pageSize;
  }
  // A race with no results yet has no classified rows: keep only races that have happened.
  return races.filter((r) => r.rows.length > 0 && Date.parse(r.date) < Date.now());
}

/** Scores the grid-only and the grid+form+team models on one set of test rows, after training on `train`. */
function scoreSeason(train: FeatureRow[], test: FeatureRow[]) {
  const { gridModel, evaluation } = evaluatePodiumModel(train, test);
  return { gridModel, evaluation };
}

async function main() {
  const latestYear = new Date().getUTCFullYear();
  const records: RaceRecord[] = [];
  for (let season = FIRST_SEASON; season <= latestYear; season++) {
    records.push(...(await seasonRaces(season)));
  }
  const rows = buildFeatureRows(records).filter((r) => r.season >= TRAIN_FROM);
  if (!rows.length) throw new Error('No completed races found');

  // Held-out season: the last full season before the current one.
  const testSeason = Math.max(...rows.map((r) => r.season).filter((s) => s < latestYear), TRAIN_FROM);
  const { evaluation } = scoreSeason(
    rows.filter((r) => r.season < testSeason),
    rows.filter((r) => r.season === testSeason),
  );
  const holdout = fitLogistic(
    rows.filter((r) => r.season < testSeason).map((r) => featureValues(r, SHIPPED_FEATURES)),
    rows.filter((r) => r.season < testSeason).map((r) => r.podium),
  );

  // Latest season (in progress): trained only on earlier seasons, so the check is genuinely out-of-sample.
  const latestRows = rows.filter((r) => r.season === latestYear);
  const latest = latestRows.length
    ? scoreSeason(rows.filter((r) => r.season < latestYear), latestRows)
    : null;

  // The shipped model learns from every completed race, including the season in progress.
  const shipped = fitLogistic(
    rows.map((r) => featureValues(r, SHIPPED_FEATURES)),
    rows.map((r) => r.podium),
  );
  const last = rows[rows.length - 1];
  const artifact = {
    version: 2,
    generatedAt: new Date().toISOString(),
    trainedThrough: { season: last.season, round: last.round },
    features: SHIPPED_FEATURES,
    model: shipped,
    holdoutModel: holdout,
    evaluation: { trainSeasons: `${TRAIN_FROM}-${testSeason - 1}`, testSeason, ...evaluation },
    latestSeasonCheck: latest
      ? { season: latestYear, races: new Set(latestRows.map((r) => r.round)).size, ...latest.evaluation }
      : null,
  };
  writeFileSync('lib/models/podium-model.json', JSON.stringify(artifact, null, 2) + '\n');
  console.log('held-out', testSeason, JSON.stringify(evaluation, null, 2));
  if (latest) console.log('latest season', latestYear, 'out of sample', JSON.stringify(latest.evaluation, null, 2));
  console.log('shipped weights (grid):', shipped.weights.map((w) => w.toFixed(3)), 'intercept', shipped.intercept.toFixed(3));
  console.log('features scored alongside:', FEATURE_NAMES.join(', '), '| trained through', artifact.trainedThrough);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
