import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dynamic, GET } from './route';
import { F1_NEWS_FEED_URL, F1_NEWS_PAGE_URL } from '@/lib/f1-news';

const fetchMock = vi.fn<typeof fetch>();
const FEED = '<rss><channel><item><title>Latest news</title><link>https://www.formula1.com/en/latest/article/example.1</link><description>Race news</description></item></channel></rss>';
const PAGE = '<a href="/en/latest/article/fallback.2">Official fallback headline</a>';

describe('GET /api/f1-news', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads at request time and caches only usable headlines', async () => {
    fetchMock.mockResolvedValue(new Response(FEED));
    const response = await GET();

    expect(dynamic).toBe('force-dynamic');
    expect(response.status).toBe(200);
    expect((await response.json()).items[0].title).toBe('Latest news');
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=900');
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(F1_NEWS_FEED_URL, {
      headers: { Accept: 'application/rss+xml, application/xml;q=0.9' },
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
  });

  it.each([
    ['HTTP failure', () => Promise.resolve(new Response('Unavailable', { status: 503 }))],
    ['invalid feed', () => Promise.resolve(new Response('<html>Challenge page</html>'))],
    ['network failure', () => Promise.reject(new TypeError('DNS unavailable'))],
    ['timeout', () => Promise.reject(new DOMException('Timed out', 'TimeoutError'))],
  ])('uses the official listing after a feed %s', async (_, fail) => {
    fetchMock.mockImplementationOnce(fail).mockResolvedValueOnce(new Response(PAGE));
    const response = await GET();

    expect(response.status).toBe(200);
    expect((await response.json()).items).toEqual([
      { title: 'Official fallback headline', link: 'https://www.formula1.com/en/latest/article/fallback.2', description: '' },
    ]);
    expect(fetchMock).toHaveBeenLastCalledWith(F1_NEWS_PAGE_URL, expect.objectContaining({
      cache: 'no-store', signal: expect.any(AbortSignal),
    }));
  });

  it('reports an uncached outage and retries successfully on the next request', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('DNS unavailable'))
      .mockResolvedValueOnce(new Response('<html>No headlines available</html>'))
      .mockResolvedValueOnce(new Response(FEED));

    const failed = await GET();
    expect(failed.status).toBe(502);
    expect(failed.headers.get('Cache-Control')).toBe('no-store');
    expect(failed.headers.get('Retry-After')).toBe('60');
    expect(await failed.json()).toEqual({ error: 'Could not load F1 news right now.' });
    expect((await GET()).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
