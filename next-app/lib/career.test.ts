import { describe, expect, it } from 'vitest';
import {
  flattenRaceResults,
  isClassified,
  summarizeConstructorCareer,
  summarizeDriverCareer,
} from '@/lib/career';

const race = (season: string, raceName: string, results: any[]) => ({ season, raceName, Results: results });
const entry = (driverId: string, givenName: string, familyName: string, constructorId: string, constructorName: string, fields: Record<string, any>) => ({
  Driver: { driverId, givenName, familyName },
  Constructor: { constructorId, name: constructorName },
  ...fields,
});

const RACES = [
  race('2024', 'Australian Grand Prix', [
    entry('alpha', 'Ann', 'Alpha', 'red', 'Red Team', { position: '1', grid: '1', points: '25', status: 'Finished', FastestLap: { rank: '1' } }),
    entry('beta', 'Ben', 'Beta', 'red', 'Red Team', { position: '2', grid: '3', points: '18', status: '+1 Lap' }),
    entry('gamma', 'Cy', 'Gamma', 'blue', 'Blue Team', { position: '19', grid: '10', points: '0', status: 'Engine' }),
  ]),
  race('2025', 'Bahrain Grand Prix', [
    entry('alpha', 'Ann', 'Alpha', 'blue', 'Blue Team', { position: '3', grid: '2', points: '15', status: 'Finished' }),
    entry('beta', 'Ben', 'Beta', 'red', 'Red Team', { position: '20', grid: '20', points: '0', status: 'Accident' }),
    entry('gamma', 'Cy', 'Gamma', 'blue', 'Blue Team', { position: '4', grid: '5', points: '12', status: 'Finished' }),
  ]),
];

describe('isClassified', () => {
  it('treats finished and lapped finishes as classified', () => {
    expect(isClassified('Finished')).toBe(true);
    expect(isClassified('+1 Lap')).toBe(true);
    expect(isClassified('+2 Laps')).toBe(true);
  });

  it('treats retirements as not classified', () => {
    expect(isClassified('Engine')).toBe(false);
    expect(isClassified('Accident')).toBe(false);
  });
});

describe('flattenRaceResults', () => {
  it('returns one row per driver result with season and names', () => {
    const rows = flattenRaceResults(RACES);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ season: '2024', driverId: 'alpha', driverName: 'Ann Alpha', constructorName: 'Red Team', fastestLapRank: '1' });
  });

  it('tolerates missing lists', () => {
    expect(flattenRaceResults([{ season: '2024', Results: undefined }])).toEqual([]);
  });
});

describe('summarizeDriverCareer', () => {
  it('counts wins, podiums, poles, fastest laps, points and DNFs', () => {
    const alpha = summarizeDriverCareer(flattenRaceResults(RACES).filter((r) => r.driverId === 'alpha'));
    expect(alpha.totals).toEqual({ starts: 2, wins: 1, podiums: 2, poles: 1, fastestLaps: 1, points: 40, dnfs: 0, seasons: 2 });
  });

  it('counts lapped finishes as classified but retirements as DNFs', () => {
    const beta = summarizeDriverCareer(flattenRaceResults(RACES).filter((r) => r.driverId === 'beta'));
    expect(beta.totals.dnfs).toBe(1);
    expect(beta.totals.podiums).toBe(1);
    expect(beta.totals.wins).toBe(0);
  });

  it('lists seasons newest first with the latest team per season', () => {
    const alpha = summarizeDriverCareer(flattenRaceResults(RACES).filter((r) => r.driverId === 'alpha'));
    expect(alpha.seasons.map((s) => s.season)).toEqual(['2025', '2024']);
    expect(alpha.seasons[0]).toMatchObject({ team: 'Blue Team', races: 1, points: 15, podiums: 1 });
  });

  it('returns empty totals when there are no results', () => {
    const empty = summarizeDriverCareer([]);
    expect(empty.totals.starts).toBe(0);
    expect(empty.seasons).toEqual([]);
  });
});

describe('summarizeConstructorCareer', () => {
  it('sums both cars and lists each season’s drivers once', () => {
    const red = summarizeConstructorCareer(flattenRaceResults(RACES).filter((r) => r.constructorId === 'red'));
    expect(red.totals).toMatchObject({ entries: 3, wins: 1, podiums: 2, points: 43, seasons: 2 });
    const season2024 = red.seasons.find((s) => s.season === '2024');
    expect(season2024?.drivers).toEqual(['Ann Alpha', 'Ben Beta']);
  });

  it('keeps drivers from a season when they moved to another team later', () => {
    const blue = summarizeConstructorCareer(flattenRaceResults(RACES).filter((r) => r.constructorId === 'blue'));
    expect(blue.seasons.find((s) => s.season === '2025')?.drivers).toEqual(['Ann Alpha', 'Cy Gamma']);
    expect(blue.seasons.find((s) => s.season === '2024')?.drivers).toEqual(['Cy Gamma']);
  });
});
