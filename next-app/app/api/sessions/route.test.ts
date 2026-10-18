import { beforeEach, describe, expect, it, vi } from 'vitest';
const { sessions } = vi.hoisted(() => ({ sessions: vi.fn() }));
vi.mock('@/lib/f1-api', () => ({ f1Api: { sessions } }));
import { GET } from './route';
import { OpenF1Error } from '@/lib/openf1-auth';

describe('GET /api/sessions', () => {
  beforeEach(() => vi.resetAllMocks());
  it('proxies a validated season through the authenticated server client', async () => {
    sessions.mockResolvedValue({ data: [{ session_key: 987 }] });
    const response = await GET(new Request('http://localhost/api/sessions?season=2026'));
    expect(sessions).toHaveBeenCalledWith({ year: 2026 });
    expect(await response.json()).toEqual([{ session_key: 987 }]);
  });
  it('rejects invalid seasons and returns a safe provider access message', async () => {
    expect((await GET(new Request('http://localhost/api/sessions?season=bad'))).status).toBe(400);
    expect(sessions).not.toHaveBeenCalled();
    sessions.mockRejectedValue(new OpenF1Error('Live access requires server credentials.', 'OPENF1_ACCESS_REQUIRED'));
    const response = await GET(new Request('http://localhost/api/sessions?season=2026'));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'OPENF1_ACCESS_REQUIRED' });
  });
});
