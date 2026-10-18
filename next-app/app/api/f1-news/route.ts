import { NextResponse } from 'next/server';
import { F1_NEWS_FEED_URL, F1_NEWS_PAGE_URL, parseF1NewsFeed, parseF1NewsPage } from '@/lib/f1-news';

const REVALIDATE_SECONDS = 15 * 60;

// Fetch news at request time: builds must not depend on an external DNS/network service.
export const dynamic = 'force-dynamic';

export async function GET() {
  const sources = [
    { url: F1_NEWS_FEED_URL, accept: 'application/rss+xml, application/xml;q=0.9', parse: parseF1NewsFeed },
    { url: F1_NEWS_PAGE_URL, accept: 'text/html', parse: parseF1NewsPage },
  ];

  for (const source of sources) {
    try {
      const res = await fetch(source.url, {
        headers: { Accept: source.accept },
        // Cache only usable responses below, so outages/invalid documents recover immediately.
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;
      const items = source.parse(await res.text(), 6);
      if (!items.length) continue;
      return NextResponse.json({ items }, {
        headers: { 'Cache-Control': `public, max-age=0, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=60` },
      });
    } catch {
      // A blocked, timed-out or malformed source must not prevent the fallback request.
    }
  }

  return NextResponse.json({ error: 'Could not load F1 news right now.' }, {
    status: 502,
    headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
  });
}
