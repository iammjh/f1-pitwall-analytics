// Podium model: logistic regression on information known before the race starts.
// Features: grid slot, the driver's recent finishing average, and the team's recent points. Each row only
// uses races that happened before it, so the model never sees the result it is predicting.

export interface ResultRow {
  driverId: string;
  constructorId: string;
  /** Starting grid slot. 0 means the pit lane, which is treated as the back of the grid. */
  grid: number;
  /** Classified finishing position, or null when the car did not finish. */
  finish: number | null;
  points: number;
}

export interface RaceRecord {
  season: number;
  round: number;
  date: string;
  rows: ResultRow[];
}

export interface FeatureRow {
  season: number;
  round: number;
  driverId: string;
  constructorId: string;
  grid: number;
  formAvg: number;
  teamForm: number;
  finish: number | null;
  podium: 0 | 1;
}

export const FEATURE_NAMES = ['grid', 'formAvg', 'teamForm'] as const;

const FORM_WINDOW = 5; // races of finishing positions
const TEAM_WINDOW = 10; // car-races of points (two cars for five races)
const BACK_OF_GRID = 20;
const DID_NOT_FINISH = 20;
const NEUTRAL_FORM = 10.5;

export function effectiveGrid(grid: number): number {
  return grid > 0 ? grid : BACK_OF_GRID;
}

function average(values: number[], fallback: number): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : fallback;
}

/**
 * One row per driver per race, in race order. Form comes only from earlier races, so the row for a race
 * never contains that race's own result.
 */
export function buildFeatureRows(races: RaceRecord[]): FeatureRow[] {
  const ordered = [...races].sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round);
  const driverFinishes = new Map<string, number[]>();
  const teamPoints = new Map<string, number[]>();
  const rows: FeatureRow[] = [];

  for (const race of ordered) {
    for (const row of race.rows) {
      const finishes = driverFinishes.get(row.driverId) ?? [];
      const points = teamPoints.get(row.constructorId) ?? [];
      rows.push({
        season: race.season,
        round: race.round,
        driverId: row.driverId,
        constructorId: row.constructorId,
        grid: effectiveGrid(row.grid),
        formAvg: average(finishes.slice(-FORM_WINDOW), NEUTRAL_FORM),
        teamForm: average(points.slice(-TEAM_WINDOW), 0),
        finish: row.finish,
        podium: row.finish !== null && row.finish >= 1 && row.finish <= 3 ? 1 : 0,
      });
    }
    // Only after every row in this race has its features do its results become history.
    for (const row of race.rows) {
      driverFinishes.set(row.driverId, [...(driverFinishes.get(row.driverId) ?? []), row.finish ?? DID_NOT_FINISH]);
      teamPoints.set(row.constructorId, [...(teamPoints.get(row.constructorId) ?? []), row.points]);
    }
  }
  return rows;
}

/** One race from a Jolpica results page, in the shape the model uses. Non-numeric positions are non-finishes. */
export function toRaceRecord(race: any, season: number): RaceRecord {
  return {
    season,
    round: Number(race.round),
    date: `${race.date}T${race.time || '23:59:59Z'}`,
    rows: (race.Results ?? []).map((res: any) => {
      const classified = /^\d+$/.test(String(res.positionText ?? ''));
      return {
        driverId: String(res.Driver?.driverId ?? ''),
        constructorId: String(res.Constructor?.constructorId ?? ''),
        grid: Number(res.grid ?? 0),
        finish: classified ? Number(res.position) : null,
        points: Number(res.points ?? 0),
      };
    }),
  };
}

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export interface LogisticModel {
  intercept: number;
  /** Weights per feature, on the standardized scale (so their sizes are comparable). */
  weights: number[];
  means: number[];
  scales: number[];
}

/** Solves A x = b by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c];
    x[r] = sum / M[r][r];
  }
  return x;
}

/**
 * Logistic regression by Newton's method (iteratively reweighted least squares). A small L2 penalty keeps the
 * weights finite when features are close to collinear. The intercept is not penalised.
 */
export function fitLogistic(X: number[][], y: number[], options: { l2?: number; iterations?: number } = {}): LogisticModel {
  const l2 = options.l2 ?? 1e-3;
  const iterations = options.iterations ?? 50;
  const n = X.length;
  const k = X[0]?.length ?? 0;
  const means = Array.from({ length: k }, (_, j) => X.reduce((s, row) => s + row[j], 0) / n);
  const scales = Array.from({ length: k }, (_, j) => {
    const sd = Math.sqrt(X.reduce((s, row) => s + (row[j] - means[j]) ** 2, 0) / n);
    return sd > 0 ? sd : 1;
  });
  const Z = X.map((row) => [1, ...row.map((v, j) => (v - means[j]) / scales[j])]);
  const p = k + 1;
  let beta = new Array(p).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    const g = new Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      const prob = sigmoid(Z[i].reduce((s, v, j) => s + v * beta[j], 0));
      const w = prob * (1 - prob);
      for (let a = 0; a < p; a++) {
        g[a] += Z[i][a] * (y[i] - prob);
        for (let b = 0; b < p; b++) H[a][b] += w * Z[i][a] * Z[i][b];
      }
    }
    for (let a = 1; a < p; a++) {
      g[a] -= l2 * beta[a];
      H[a][a] += l2;
    }
    const step = solve(H, g);
    beta = beta.map((v, j) => v + step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-9) break;
  }

  return { intercept: beta[0], weights: beta.slice(1), means, scales };
}

export function predictLogistic(model: LogisticModel, x: number[]): number {
  const z = model.intercept + x.reduce((s, v, j) => s + model.weights[j] * ((v - model.means[j]) / model.scales[j]), 0);
  return sigmoid(z);
}

export function brierScore(probabilities: number[], outcomes: number[]): number {
  const n = outcomes.length;
  return probabilities.reduce((s, p, i) => s + (p - outcomes[i]) ** 2, 0) / n;
}

export function logLoss(probabilities: number[], outcomes: number[]): number {
  const eps = 1e-15;
  const n = outcomes.length;
  return -probabilities.reduce((s, p, i) => {
    const q = Math.min(1 - eps, Math.max(eps, p));
    return s + outcomes[i] * Math.log(q) + (1 - outcomes[i]) * Math.log(1 - q);
  }, 0) / n;
}

export interface PodiumEvaluation {
  testRows: number;
  /** Share of the training rows that were podium finishes. */
  baseRate: number;
  brier: { gridOnly: number; withFormAndTeam: number; baseRate: number };
  logLoss: { gridOnly: number; withFormAndTeam: number; baseRate: number };
}

/** The values a model reads for one row, in the order of the names it was trained on. */
export function featureValues(row: { grid: number; formAvg: number; teamForm: number }, names: readonly string[]): number[] {
  return names.map((name) => row[name as keyof typeof row] as number);
}

/** Fits the grid-only and the grid+form+team models on the training rows, and scores both on the test rows. */
export function evaluatePodiumModel(train: FeatureRow[], test: FeatureRow[]) {
  const y = (rows: FeatureRow[]) => rows.map((r) => r.podium);
  const gridNames = ['grid'] as const;
  const fullNames = FEATURE_NAMES;

  const gridModel = fitLogistic(train.map((r) => featureValues(r, gridNames)), y(train));
  const formModel = fitLogistic(train.map((r) => featureValues(r, fullNames)), y(train));
  const baseRate = y(train).reduce((s: number, v) => s + v, 0) / train.length;

  const outcomes = y(test);
  const gridP = test.map((r) => predictLogistic(gridModel, featureValues(r, gridNames)));
  const formP = test.map((r) => predictLogistic(formModel, featureValues(r, fullNames)));
  const baseP = outcomes.map(() => baseRate);

  const evaluation: PodiumEvaluation = {
    testRows: test.length,
    baseRate,
    brier: { gridOnly: brierScore(gridP, outcomes), withFormAndTeam: brierScore(formP, outcomes), baseRate: brierScore(baseP, outcomes) },
    logLoss: { gridOnly: logLoss(gridP, outcomes), withFormAndTeam: logLoss(formP, outcomes), baseRate: logLoss(baseP, outcomes) },
  };
  return { gridModel, formModel, evaluation };
}

export interface PodiumModelArtifact {
  version: 2;
  generatedAt: string;
  trainedThrough: { season: number; round: number };
  /** The features the shipped model reads. Form and team points are context only, not inputs. */
  features: readonly string[];
  /** Learns from every completed race. Use it for races after the test season. */
  model: LogisticModel;
  /** Learns only up to the test season, so its scores on that season are out-of-sample. */
  holdoutModel: LogisticModel;
  evaluation: { trainSeasons: string; testSeason: number } & PodiumEvaluation;
  /** The latest season, scored by a model trained only on the seasons before it. */
  latestSeasonCheck: { season: number; races: number } & PodiumEvaluation;
}

export function predictPodium(artifact: PodiumModelArtifact, row: { grid: number; formAvg: number; teamForm: number }): number {
  return predictLogistic(artifact.model, featureValues(row, artifact.features));
}
