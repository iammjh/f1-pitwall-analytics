import { describe, expect, it } from 'vitest';
import {
  getTelemetryPresentation,
  normalizeLiveRacePayload,
  normalizeTelemetryPayload,
  selectPreferredSession,
  selectTelemetryDriver,
} from '@/lib/live-telemetry';

describe('live telemetry helpers', () => {
  it('keeps a short DRS opening that falls between the points it samples', () => {
    const base = Date.UTC(2026, 9, 18, 12, 0, 0);
    // 600 readings about 0.25 s apart; only one, in the middle, has DRS open for a moment.
    const carData = Array.from({ length: 600 }, (_, i) => ({
      date: new Date(base + i * 250).toISOString(),
      speed: 300,
      drs: i === 301 ? 12 : 0,
    }));
    const payload = normalizeTelemetryPayload({ carData });
    expect(payload.samples.length).toBeLessThanOrEqual(60);
    expect(payload.samples.some((sample) => sample.drs === 100)).toBe(true);
  });

  it('reports DRS as unknown, not closed, when the feed sends no DRS values', () => {
    const payload = normalizeTelemetryPayload({
      carData: [{ date: '2026-10-18T12:00:00Z', speed: 200, drs: null }, { date: '2026-10-18T12:00:01Z', speed: 210, drs: null }],
    });
    expect(payload.samples.map((sample) => sample.drs)).toEqual([null, null]);
    expect(payload.currentMetrics?.drs).toBeNull();
  });

  it('does not guess DRS from speed when only lap summaries are available', () => {
    const payload = normalizeTelemetryPayload({
      laps: [{ lap_number: 1, st_speed: 330, date_start: '2026-10-18T12:00:00Z' }],
    });
    expect(payload.source).toBe('lap-data');
    expect(payload.samples[0].drs).toBeNull();
  });

  it.each([0, 1, 2, 3, 8, 9, 10, 12, 14])('decodes OpenF1 DRS status %i', (drs) => {
    const payload = normalizeTelemetryPayload({ carData: [{ drs, date: '2026-10-18T12:00:00Z' }] });
    expect(payload.currentMetrics?.drs).toBe([10, 12, 14].includes(drs) ? 100 : 0);
  });
  it('prefers a live race session over other live sessions', () => {
    const now = new Date('2026-07-04T10:00:00Z');
    const sessions = [
      {
        session_key: 11,
        meeting_key: 99,
        session_name: 'Practice 3',
        meeting_name: 'British Grand Prix',
        date_start: '2026-07-04T09:00:00Z',
        date_end: '2026-07-04T11:00:00Z',
      },
      {
        session_key: 12,
        meeting_key: 99,
        session_name: 'Race',
        meeting_name: 'British Grand Prix',
        date_start: '2026-07-04T08:00:00Z',
        date_end: '2026-07-04T12:00:00Z',
      },
    ];

    const selected = selectPreferredSession(sessions, { preferRace: true, now });

    expect(selected?.session_key).toBe(12);
  });

  it('prefers the latest completed session over a future scheduled one for telemetry', () => {
    const now = new Date('2026-07-04T10:00:00Z');
    const sessions = [
      {
        session_key: 21,
        meeting_key: 120,
        session_name: 'Practice 2',
        meeting_name: 'Belgian Grand Prix',
        date_start: '2026-07-10T09:00:00Z',
        date_end: '2026-07-10T10:00:00Z',
      },
      {
        session_key: 22,
        meeting_key: 119,
        session_name: 'Qualifying',
        meeting_name: 'British Grand Prix',
        date_start: '2026-07-03T12:00:00Z',
        date_end: '2026-07-03T13:00:00Z',
      },
    ];

    const selected = selectPreferredSession(sessions, { preferRace: false, now });

    expect(selected?.session_key).toBe(22);
  });

  it('normalizes live race payloads into leaderboard and lap series data', () => {
    const payload = normalizeLiveRacePayload({
      now: new Date('2026-07-05T12:00:00Z'),
      session: {
        session_key: 44,
        meeting_key: 2,
        session_name: 'Race',
        meeting_name: 'British Grand Prix',
        circuit_short_name: 'Silverstone',
        date_start: '2026-07-05T09:00:00Z',
        date_end: '2026-07-05T11:00:00Z',
      },
      drivers: [
        {
          driver_number: 1,
          full_name: 'Max Verstappen',
          name_acronym: 'VER',
          team_name: 'Red Bull Racing',
          team_colour: '3671C6',
        },
        {
          driver_number: 16,
          full_name: 'Charles Leclerc',
          name_acronym: 'LEC',
          team_name: 'Ferrari',
          team_colour: 'E8002D',
        },
      ],
      positions: [
        { driver_number: 1, position: 1, date: '2026-07-05T10:30:00Z' },
        { driver_number: 16, position: 2, date: '2026-07-05T10:30:00Z' },
      ],
      laps: [
        { driver_number: 1, lap_number: 1, lap_duration: 91.2, date_start: '2026-07-05T09:05:00Z' },
        { driver_number: 1, lap_number: 2, lap_duration: 90.8, date_start: '2026-07-05T09:07:00Z' },
        { driver_number: 16, lap_number: 1, lap_duration: 91.5, date_start: '2026-07-05T09:05:10Z' },
        { driver_number: 16, lap_number: 2, lap_duration: 91.1, date_start: '2026-07-05T09:07:10Z' },
      ],
    });

    expect(payload.status).toBe('recent');
    expect(payload.leaderboard[0]?.code).toBe('VER');
    expect(payload.leaderboard[1]?.code).toBe('LEC');
    expect(payload.lapSeries).toEqual([
      { lap: 1, VER: 91.2, LEC: 91.5 },
      { lap: 2, VER: 90.8, LEC: 91.1 },
    ]);
  });

  it('falls back to lap-derived telemetry when car samples are unavailable', () => {
    const rawDrivers = [
      {
        driver_number: 1,
        full_name: 'Max Verstappen',
        name_acronym: 'VER',
        team_name: 'Red Bull Racing',
        team_colour: '3671C6',
      },
    ];
    const selectedDriver = selectTelemetryDriver(rawDrivers, 'VER');

    const payload = normalizeTelemetryPayload({
      now: new Date('2026-07-05T10:00:00Z'),
      session: {
        session_key: 77,
        meeting_key: 3,
        session_name: 'Race',
        meeting_name: 'Hungarian Grand Prix',
        date_start: '2026-07-05T09:00:00Z',
      },
      drivers: rawDrivers,
      selectedDriver,
      carData: [],
      laps: [
        { driver_number: 1, lap_number: 1, lap_duration: 92.5, st_speed: 302, date_start: '2026-07-05T09:02:00Z' },
        { driver_number: 1, lap_number: 2, lap_duration: 92.0, st_speed: 305, date_start: '2026-07-05T09:04:00Z' },
      ],
      positions: [{ driver_number: 1, position: 2, date: '2026-07-05T09:04:10Z' }],
    });

    expect(payload.source).toBe('lap-data');
    expect(payload.selectedDriver?.code).toBe('VER');
    expect(payload.samples).toHaveLength(2);
    expect(payload.currentMetrics?.lap).toBe(2);
    expect(payload.currentMetrics?.position).toBe(2);
    expect(payload.currentMetrics?.speed).toBe(305);
    expect(payload.derivedMetricsNotice).toContain('speed-trap reading');
    expect(payload.derivedMetricsNotice).toContain('Throttle, brake, gear, RPM and DRS are modeled estimates');
    expect(getTelemetryPresentation(payload.source)).toMatchObject({
      speedLabel: 'Speed trap',
      speedChartTitle: 'Speed Trap by Lap',
      axisKey: 'lap',
    });
  });

  it('reports only measured channels for car samples, with no fuel or tyre temperature estimates', () => {
    const payload = normalizeTelemetryPayload({
      carData: [{
        date: '2026-07-05T09:02:30Z',
        speed: 301,
        throttle: 100,
        brake: 0,
        n_gear: 8,
        rpm: 12000,
      }],
    });

    expect(payload.source).toBe('car-data');
    expect(payload.currentMetrics?.speed).toBe(301);
    expect(payload.currentMetrics).not.toHaveProperty('fuel');
    expect(payload.currentMetrics).not.toHaveProperty('tireTempF');
    expect(payload.currentMetrics).not.toHaveProperty('tireTempR');
    expect(payload.derivedMetricsNotice).toBeNull();
    expect(getTelemetryPresentation(payload.source)).toMatchObject({
      sourceLabel: 'OpenF1 car samples',
      speedLabel: 'Speed',
      axisKey: 'time',
    });
  });

  it('does not imply telemetry exists when no source is available', () => {
    const payload = normalizeTelemetryPayload({});

    expect(payload.source).toBe('none');
    expect(payload.samples).toEqual([]);
    expect(payload.derivedMetricsNotice).toBeNull();
  });

  it('does not fabricate zero speed telemetry from laps without speed-trap readings', () => {
    const payload = normalizeTelemetryPayload({
      laps: [
        { lap_number: 1, lap_duration: 92.5 },
        { lap_number: 2, lap_duration: 92.0, st_speed: null },
      ],
    });

    expect(payload.source).toBe('none');
    expect(payload.samples).toEqual([]);
    expect(payload.currentMetrics).toBeNull();
    expect(payload.derivedMetricsNotice).toBeNull();
  });
});
