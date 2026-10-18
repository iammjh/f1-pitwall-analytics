// Builds lib/models/tyre-wear-by-circuit.json from OpenF1 laps and stints, one race at a time.
// Run: node --experimental-strip-types scripts/train-tyre-wear.ts
import { writeFileSync } from 'node:fs';
import { fitTyreModel, type LapRow, type Stint } from '../lib/pit-strategy.ts';
import { aggregateCircuitWear, MIN_RACES_TO_PUBLISH, type DriverWearFit } from '../lib/tyre-wear.ts';

const OPENF1 = 'https://api.openf1.org/v1';
const FIRST_SEASON = 2023; // OpenF1 lap timing and stints start in 2023.
const GAP_MS = 2200; // OpenF1's free tier allows about 30 requests a minute.

let lastCall = 0;
async function openf1(path: string): Promise<any[]> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    const res = await fetch(`${OPENF1}/${path}`);
    if (res.ok) return res.json();
    if (res.status !== 429 && res.status < 500) {
      if (res.status === 404) return []; // OpenF1 answers 404 when a query matches nothing
      throw new Error(`OpenF1 ${res.status} for ${path}`);
    }
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
  throw new Error(`OpenF1 kept failing for ${path}`);
}

function lapRows(laps: any[]): LapRow[] {
  return laps.map((l) => ({
    lap: Number(l.lap_number),
    durationSec: l.lap_duration == null ? null : Number(l.lap_duration),
    pitOut: Boolean(l.is_pit_out_lap),
  }));
}

function stintRows(stints: any[]): Stint[] {
  return stints.map((s) => ({
    stintNumber: Number(s.stint_number),
    compound: String(s.compound ?? 'UNKNOWN').toUpperCase(),
    lapStart: Number(s.lap_start),
    lapEnd: Number(s.lap_end),
    tyreAgeAtStart: Number(s.tyre_age_at_start ?? 0),
  }));
}

async function main() {
  const now = Date.now();
  const latest = new Date().getUTCFullYear();
  const fits: DriverWearFit[] = [];
  const seasons: number[] = [];

  for (let season = FIRST_SEASON; season <= latest; season++) {
    const sessions = (await openf1(`sessions?year=${season}&session_name=Race`)).filter(
      (s) => Date.parse(s.date_start) < now,
    );
    if (!sessions.length) continue;
    seasons.push(season);

    for (const session of sessions) {
      const [laps, stints] = [
        await openf1(`laps?session_key=${session.session_key}`),
        await openf1(`stints?session_key=${session.session_key}`),
      ];
      const lapsByDriver = new Map<number, any[]>();
      for (const lap of laps) lapsByDriver.set(lap.driver_number, [...(lapsByDriver.get(lap.driver_number) ?? []), lap]);
      const stintsByDriver = new Map<number, any[]>();
      for (const stint of stints) stintsByDriver.set(stint.driver_number, [...(stintsByDriver.get(stint.driver_number) ?? []), stint]);

      for (const [driverNumber, driverStints] of stintsByDriver) {
        const driverLaps = lapsByDriver.get(driverNumber) ?? [];
        if (!driverLaps.length) continue;
        const model = fitTyreModel(lapRows(driverLaps), stintRows(driverStints));
        for (const compound of Object.keys(model.samplesByCompound)) {
          fits.push({
            circuitKey: Number(session.circuit_key),
            circuitName: String(session.circuit_short_name ?? session.location ?? 'Unknown'),
            season,
            sessionKey: Number(session.session_key),
            driverNumber: Number(driverNumber),
            compound,
            slopeSecPerLap: model.slopeByCompound[compound],
            samples: model.samplesByCompound[compound],
          });
        }
      }
      console.log(`${season} ${session.location}: ${stintsByDriver.size} drivers`);
    }
  }

  const { circuits } = aggregateCircuitWear(fits, { minRaces: MIN_RACES_TO_PUBLISH });
  const artifact = {
    version: 1,
    generatedAt: new Date().toISOString(),
    seasons,
    minRaces: MIN_RACES_TO_PUBLISH,
    circuits,
  };
  writeFileSync('lib/models/tyre-wear-by-circuit.json', JSON.stringify(artifact, null, 2) + '\n');
  console.log(`driver-stint fits: ${fits.length}; circuits published: ${Object.keys(circuits).length}`);
  for (const [key, c] of Object.entries(circuits)) {
    const summary = Object.entries(c.compounds).map(([k, v]) => `${k} ${v.slopeSecPerLap} (${v.races} races)`).join(', ');
    console.log(`  ${c.circuitName} [${key}]: ${summary}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
