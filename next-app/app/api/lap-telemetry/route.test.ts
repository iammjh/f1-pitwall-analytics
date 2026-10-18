import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const { api } = vi.hoisted(() => ({ api: { sessions: vi.fn(), drivers: vi.fn(), laps: vi.fn(), carDataWindow: vi.fn() } }));
vi.mock('@/lib/f1-api', () => ({ f1Api: api }));
let GET: typeof import('./route').GET;
const carData = [{ date: '2024-03-02T14:00:10Z', speed: 300, drs: 8 }];
const request = () => new NextRequest('http://localhost/api/lap-telemetry?season=2024&date=2024-03-02&lap=1&drivers=VER');

describe('lap telemetry recovery', () => {
  beforeEach(async () => {
    vi.resetAllMocks(); vi.resetModules();
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    ({ GET } = await import('./route'));
    api.sessions.mockResolvedValue({ data: [{ session_key: 987, session_name: 'Race', date_start: '2024-03-02T14:00:00Z', date_end: '2024-03-02T16:00:00Z' }] });
    api.drivers.mockResolvedValue({ data: [{ name_acronym: 'VER', driver_number: 1 }] });
    api.laps.mockResolvedValue({ data: [{ lap_number: 1, date_start: '2024-03-02T14:00:00Z', lap_duration: 90 }] });
    api.carDataWindow.mockResolvedValue({ data: carData });
  });
  afterEach(() => vi.useRealTimers());

  it('recovers on the next request after a temporary car-data failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.carDataWindow.mockRejectedValueOnce(new Error('Temporary outage'));
    expect((await GET(request())).status).toBe(502);
    expect((await (await GET(request())).json()).available).toBe(true);
    expect(api.carDataWindow).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('does not cache an empty feed as proof that a lap has no telemetry', async () => {
    api.carDataWindow.mockResolvedValueOnce({ data: [] });
    const first = await GET(request());
    expect((await first.json()).available).toBe(false);
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    expect((await (await GET(request())).json()).available).toBe(true);
    expect(api.carDataWindow).toHaveBeenCalledTimes(2);
  });

  it('caches healthy historical samples and decodes eligible DRS as closed', async () => {
    const payload = await (await GET(request())).json();
    expect(payload.drivers.VER.samples[0].drs).toBe(false);
    await GET(request());
    expect(api.carDataWindow).toHaveBeenCalledTimes(1);
  });

  it('reports denied provider access explicitly and keeps it retryable', async () => {
    const { OpenF1Error } = await import('@/lib/openf1-auth');
    api.carDataWindow.mockRejectedValueOnce(new OpenF1Error('Live access requires credentials.', 'OPENF1_ACCESS_REQUIRED'));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'OPENF1_ACCESS_REQUIRED' });
    expect((await (await GET(request())).json()).available).toBe(true);
  });
});
