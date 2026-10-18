import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { f1ApiMock } = vi.hoisted(() => ({
  f1ApiMock: {
    sessions: vi.fn(),
    drivers: vi.fn(),
    laps: vi.fn(),
    positions: vi.fn(),
    carData: vi.fn(),
    carDataWindow: vi.fn(),
  },
}));

vi.mock('@/lib/f1-api', () => ({
  f1Api: f1ApiMock,
}));

let GET: typeof import('@/app/api/telemetry/route').GET;

function mockSession(endTime?: string) {
  f1ApiMock.sessions.mockResolvedValue({ data: [{
    session_key: 987, session_name: 'Race', date_start: '2026-10-18T11:00:00Z', date_end: endTime,
  }] });
  f1ApiMock.drivers.mockResolvedValue({ data: [{ driver_number: 1, name_acronym: 'VER', full_name: 'Example Driver' }] });
  f1ApiMock.laps.mockResolvedValue({ data: [] });
  f1ApiMock.positions.mockResolvedValue({ data: [] });
  f1ApiMock.carDataWindow.mockResolvedValue({ data: [{ date: '2026-10-18T11:59:59Z', speed: 200, drs: 0 }] });
}

async function requestTelemetry() {
  return GET(new Request('http://localhost/api/telemetry?sessionKey=987'));
}

describe('GET /api/telemetry', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    ({ GET } = await import('@/app/api/telemetry/route'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns lap-derived telemetry when car samples are missing', async () => {
    f1ApiMock.sessions.mockResolvedValue({
      data: [
        {
          session_key: 91,
          meeting_key: 3,
          session_name: 'Race',
          meeting_name: 'Hungarian Grand Prix',
          date_start: '2026-06-05T09:00:00Z',
          date_end: '2026-06-05T11:00:00Z',
        },
      ],
    });
    f1ApiMock.drivers.mockResolvedValue({
      data: [
        {
          driver_number: 1,
          full_name: 'Max Verstappen',
          name_acronym: 'VER',
          team_name: 'Red Bull Racing',
          team_colour: '3671C6',
        },
      ],
    });
    f1ApiMock.laps.mockResolvedValue({
      data: [
        { driver_number: 1, lap_number: 1, lap_duration: 92.5, st_speed: 301, date_start: '2026-07-05T09:02:00Z' },
        { driver_number: 1, lap_number: 2, lap_duration: 92.0, st_speed: 304, date_start: '2026-07-05T09:04:00Z' },
      ],
    });
    f1ApiMock.positions.mockResolvedValue({
      data: [{ driver_number: 1, position: 2, date: '2026-07-05T09:04:10Z' }],
    });
    f1ApiMock.carData.mockResolvedValue({ data: [] });
    f1ApiMock.carDataWindow.mockResolvedValue({ data: [] });

    const response = await GET(new Request('http://localhost/api/telemetry?driver=VER'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.source).toBe('lap-data');
    expect(json.selectedDriver.code).toBe('VER');
    expect(json.currentMetrics.position).toBe(2);
    expect(json.currentMetrics.lap).toBe(2);
  });

  it('returns an empty payload when no session can be selected', async () => {
    f1ApiMock.sessions.mockResolvedValue({ data: [] });

    const response = await GET(new Request('http://localhost/api/telemetry'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.source).toBe('none');
    expect(json.session).toBeNull();
    expect(json.samples).toEqual([]);
  });

  it('uses the current year when season is omitted', async () => {
    f1ApiMock.sessions.mockResolvedValue({ data: [] });

    await GET(new Request('http://localhost/api/telemetry?driver=VER'));

    expect(f1ApiMock.sessions).toHaveBeenCalledWith({ year: new Date().getFullYear() });
  });

  it('refreshes a live session without an end time after 15 seconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    mockSession();
    expect((await (await requestTelemetry()).json()).currentMetrics.speed).toBe(200);
    f1ApiMock.carDataWindow.mockResolvedValue({ data: [{ date: '2026-10-18T12:00:15Z', speed: 321 }] });
    vi.setSystemTime(new Date('2026-10-18T12:00:16Z'));
    expect((await (await requestTelemetry()).json()).currentMetrics.speed).toBe(321);
    expect(f1ApiMock.carDataWindow).toHaveBeenCalledTimes(2);
  });

  it('does not cache an empty historical payload after an upstream outage', async () => {
    mockSession('2026-06-05T11:00:00Z');
    f1ApiMock.carDataWindow.mockRejectedValueOnce(new Error('Temporary outage'));
    const first = await requestTelemetry();
    expect((await first.json()).source).toBe('none');
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    expect((await (await requestTelemetry()).json()).source).toBe('car-data');
    expect(f1ApiMock.carDataWindow).toHaveBeenCalledTimes(2);
  });

  it('refetches partial historical data after a failed position request', async () => {
    mockSession('2026-06-05T11:00:00Z');
    f1ApiMock.positions.mockRejectedValueOnce(new Error('Temporary outage'));
    expect((await requestTelemetry()).headers.get('Cache-Control')).toBe('no-store');
    f1ApiMock.positions.mockResolvedValue({ data: [{ driver_number: 1, position: 2, date: '2026-10-18T11:59:59Z' }] });
    expect((await (await requestTelemetry()).json()).currentMetrics.position).toBe(2);
    expect(f1ApiMock.carDataWindow).toHaveBeenCalledTimes(2);
  });

  it('reuses a healthy completed session and avoids caching missing samples', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    mockSession('2026-06-05T11:00:00Z');
    await requestTelemetry();
    vi.setSystemTime(new Date('2026-10-18T12:01:00Z'));
    await requestTelemetry();
    expect(f1ApiMock.carDataWindow).toHaveBeenCalledTimes(1);
  });

  it('surfaces provider access failures instead of presenting an empty feed', async () => {
    const { OpenF1Error } = await import('@/lib/openf1-auth');
    mockSession();
    f1ApiMock.carDataWindow.mockRejectedValue(new OpenF1Error('Live access requires server credentials.', 'OPENF1_ACCESS_REQUIRED'));
    const response = await requestTelemetry();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'OPENF1_ACCESS_REQUIRED' });
  });
});
