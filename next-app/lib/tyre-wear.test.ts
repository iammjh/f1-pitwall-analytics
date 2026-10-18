import { describe, expect, it } from 'vitest';
import { aggregateCircuitWear, type DriverWearFit } from '@/lib/tyre-wear';

const fit = (over: Partial<DriverWearFit>): DriverWearFit => ({
  circuitKey: 9,
  circuitName: 'Sakhir',
  season: 2024,
  sessionKey: 1,
  driverNumber: 1,
  compound: 'SOFT',
  slopeSecPerLap: 0.1,
  samples: 20,
  ...over,
});

describe('aggregateCircuitWear', () => {
  it('publishes a compound only once enough races back it', () => {
    const two = aggregateCircuitWear([fit({ sessionKey: 1 }), fit({ sessionKey: 2 })]);
    expect(two.circuits).toEqual({});
    const three = aggregateCircuitWear([fit({ sessionKey: 1 }), fit({ sessionKey: 2 }), fit({ sessionKey: 3 })]);
    expect(three.circuits['9'].compounds.SOFT.races).toBe(3);
  });

  it('reports the spread of race estimates alongside the circuit median', () => {
    const fits = [
      fit({ sessionKey: 1, slopeSecPerLap: 0.02 }),
      fit({ sessionKey: 2, slopeSecPerLap: 0.1 }),
      fit({ sessionKey: 3, slopeSecPerLap: 0.06 }),
    ];
    const soft = aggregateCircuitWear(fits).circuits['9'].compounds.SOFT;
    expect(soft.slopeRange).toEqual([0.02, 0.1]);
    expect(soft.slopeSecPerLap).toBe(0.06);
  });

  it('takes the median of drivers within a race, then the median across races', () => {
    const fits = [
      fit({ sessionKey: 1, driverNumber: 1, slopeSecPerLap: 0.1 }),
      fit({ sessionKey: 1, driverNumber: 2, slopeSecPerLap: 0.3 }),
      fit({ sessionKey: 1, driverNumber: 3, slopeSecPerLap: 0.2 }), // race 1 median: 0.2
      fit({ sessionKey: 2, driverNumber: 1, slopeSecPerLap: 0.4 }), // race 2 median: 0.4
      fit({ sessionKey: 3, driverNumber: 1, slopeSecPerLap: 0.5 }), // race 3 median: 0.5
    ];
    const soft = aggregateCircuitWear(fits).circuits['9'].compounds.SOFT;
    expect(soft.races).toBe(3);
    expect(soft.fits).toBe(5);
    expect(soft.slopeSecPerLap).toBe(0.4);
  });

  it('ignores fits with too few clean laps', () => {
    const fits = [
      fit({ sessionKey: 1, samples: 4 }),
      fit({ sessionKey: 2, samples: 4 }),
      fit({ sessionKey: 3, samples: 20 }),
    ];
    expect(aggregateCircuitWear(fits).circuits).toEqual({});
  });

  it('keeps circuits separate and records the circuit name', () => {
    const fits = [
      fit({ circuitKey: 9, sessionKey: 1 }),
      fit({ circuitKey: 9, sessionKey: 2 }),
      fit({ circuitKey: 9, sessionKey: 3 }),
      fit({ circuitKey: 10, circuitName: 'Melbourne', sessionKey: 4 }),
    ];
    const { circuits } = aggregateCircuitWear(fits);
    expect(Object.keys(circuits)).toEqual(['9']);
    expect(circuits['9'].circuitName).toBe('Sakhir');
  });
});
