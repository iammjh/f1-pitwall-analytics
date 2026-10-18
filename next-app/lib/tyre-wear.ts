// Per-circuit tyre wear: the typical extra seconds per lap of tyre age, for each compound, across races held
// at the same circuit. A circuit is only published once enough races back the estimate.

export interface DriverWearFit {
  circuitKey: number;
  circuitName: string;
  season: number;
  sessionKey: number;
  driverNumber: number;
  compound: string;
  /** Seconds per lap of tyre age, from fitTyreModel. */
  slopeSecPerLap: number;
  /** Clean laps the fit used. */
  samples: number;
}

export interface CompoundWear {
  slopeSecPerLap: number;
  /** Lowest and highest race-level estimate, so the spread shows how sure the circuit figure is. */
  slopeRange: [number, number];
  /** Races at this circuit that contributed a fit for this compound. */
  races: number;
  /** Driver stints that contributed. */
  fits: number;
}

export interface CircuitWearArtifact {
  version: 1;
  generatedAt: string;
  seasons: number[];
  minRaces: number;
  circuits: Record<string, { circuitName: string; compounds: Record<string, CompoundWear> }>;
}

export const MIN_CLEAN_LAPS_PER_FIT = 10;
export const MIN_RACES_TO_PUBLISH = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Race-level estimate per compound (median of the drivers' fits), then the circuit estimate (median across
 * races). Only compounds backed by at least `minRaces` races are kept.
 */
export function aggregateCircuitWear(
  fits: DriverWearFit[],
  options: { minRaces?: number; minSamples?: number } = {},
): Pick<CircuitWearArtifact, 'circuits'> {
  const minRaces = options.minRaces ?? MIN_RACES_TO_PUBLISH;
  const minSamples = options.minSamples ?? MIN_CLEAN_LAPS_PER_FIT;

  const byCircuit = new Map<number, { name: string; sessions: Map<string, DriverWearFit[]> }>();
  for (const fit of fits) {
    if (fit.samples < minSamples || !Number.isFinite(fit.slopeSecPerLap)) continue;
    const circuit = byCircuit.get(fit.circuitKey) ?? { name: fit.circuitName, sessions: new Map() };
    const key = `${fit.compound}|${fit.sessionKey}`;
    circuit.sessions.set(key, [...(circuit.sessions.get(key) ?? []), fit]);
    byCircuit.set(fit.circuitKey, circuit);
  }

  const circuits: CircuitWearArtifact['circuits'] = {};
  for (const [circuitKey, circuit] of byCircuit) {
    const perCompound = new Map<string, { raceSlopes: number[]; sessionKeys: Set<number>; fits: number }>();
    for (const [key, sessionFits] of circuit.sessions) {
      const [compound, sessionKey] = key.split('|');
      const entry = perCompound.get(compound) ?? { raceSlopes: [], sessionKeys: new Set<number>(), fits: 0 };
      entry.raceSlopes.push(median(sessionFits.map((f) => f.slopeSecPerLap)));
      entry.sessionKeys.add(Number(sessionKey));
      entry.fits += sessionFits.length;
      perCompound.set(compound, entry);
    }

    const compounds: Record<string, CompoundWear> = {};
    for (const [compound, entry] of perCompound) {
      if (entry.sessionKeys.size < minRaces) continue;
      const round = (v: number) => Math.round(v * 1000) / 1000;
      compounds[compound] = {
        slopeSecPerLap: round(median(entry.raceSlopes)),
        slopeRange: [round(Math.min(...entry.raceSlopes)), round(Math.max(...entry.raceSlopes))],
        races: entry.sessionKeys.size,
        fits: entry.fits,
      };
    }
    if (Object.keys(compounds).length) circuits[String(circuitKey)] = { circuitName: circuit.name, compounds };
  }
  return { circuits };
}
