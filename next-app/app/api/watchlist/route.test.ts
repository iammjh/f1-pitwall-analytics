import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { session, watchlist } = vi.hoisted(() => ({
  session: vi.fn(),
  watchlist: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock('next-auth', () => ({ getServerSession: session }));
vi.mock('@/lib/auth-config', () => ({ getAuthOptions: () => ({}) }));
vi.mock('@/lib/prisma', () => ({ getPrisma: () => ({ watchlist }) }));
import { GET, POST } from './route';
import { DELETE, PUT } from './[id]/route';

const params = { params: { id: 'owned-list' } };
function request(body: unknown) {
  return new NextRequest('http://localhost/api/watchlist', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('watchlist route validation and ownership', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    session.mockResolvedValue({ user: { id: 'owner' } });
    watchlist.findUnique.mockResolvedValue({ userId: 'owner' });
    watchlist.findMany.mockResolvedValue([]);
    watchlist.create.mockImplementation(async ({ data }) => ({ id: 'new-list', ...data }));
    watchlist.update.mockImplementation(async ({ data }) => ({ id: 'owned-list', ...data }));
  });

  it('derives ownership from the session and lists only that user’s data', async () => {
    await GET(request({}));
    expect(watchlist.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner' } }));
    const response = await POST(request({ name: 'Favorites', userId: 'someone-else', drivers: '["max_verstappen"]' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ userId: 'owner', drivers: ['max_verstappen'], isPublic: false });
  });

  it.each(['{"unexpected":"object"}', 'null', '42', '[1]', 'not-json', { bad: true }, [null], ['']])(
    'rejects invalid array payload %j without writing data', async (drivers) => {
      expect((await POST(request({ drivers }))).status).toBe(400);
      expect((await PUT(request({ drivers }), params)).status).toBe(400);
      expect(watchlist.create).not.toHaveBeenCalled();
      expect(watchlist.update).not.toHaveBeenCalled();
    },
  );

  it.each(['', '  ', null])('clears a description explicitly with %j', async (description) => {
    expect((await PUT(request({ description }), params)).status).toBe(200);
    expect(watchlist.update).toHaveBeenCalledWith({ where: { id: 'owned-list' }, data: { description: null } });
  });

  it('leaves omitted fields absent and preserves false visibility', async () => {
    await PUT(request({ name: 'Renamed', isPublic: false }), params);
    expect(watchlist.update).toHaveBeenCalledWith({ where: { id: 'owned-list' }, data: { name: 'Renamed', isPublic: false } });
    expect((await PUT(request({ isPublic: 'false' }), params)).status).toBe(400);
  });

  it('requires authentication and rejects mutations of another user’s lists', async () => {
    session.mockResolvedValue(null);
    expect((await GET(request({}))).status).toBe(401);
    expect((await POST(request({}))).status).toBe(401);
    expect((await PUT(request({}), params)).status).toBe(401);
    expect((await DELETE(request({}), params)).status).toBe(401);
    session.mockResolvedValue({ user: { id: 'different-user' } });
    expect((await PUT(request({ name: 'Attempted edit' }), params)).status).toBe(403);
    expect((await DELETE(request({}), params)).status).toBe(403);
    expect(watchlist.update).not.toHaveBeenCalled();
    expect(watchlist.delete).not.toHaveBeenCalled();
  });
});
