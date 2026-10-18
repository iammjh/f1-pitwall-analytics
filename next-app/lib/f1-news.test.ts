import { describe, expect, it } from 'vitest';
import { decodeXmlEntities, parseF1NewsFeed, parseF1NewsPage } from '@/lib/f1-news';

const SAMPLE_FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Latest F1 News</title>
    <item>
      <title>Rwanda will write a new chapter in Africa’s rich F1 heritage</title>
      <description>The bold agreement &amp; more.</description>
      <link>https://www.formula1.com/en/latest/article/rwanda.1</link>
      <guid isPermaLink="true">https://www.formula1.com/en/latest/article/rwanda.1</guid>
    </item>
    <item>
      <title><![CDATA[Williams <b>plans</b> for 50th year]]></title>
      <description><![CDATA[<p>Anniversary   events &#8217;27</p>]]></description>
      <link>https://www.formula1.com/en/latest/article/williams.2</link>
    </item>
    <item>
      <title>Bad scheme</title>
      <link>javascript:alert(1)</link>
    </item>
    <item>
      <title></title>
      <link>https://www.formula1.com/en/latest/article/empty-title.3</link>
    </item>
    <item>
      <title>Third valid item</title>
      <description>Desc</description>
      <link>https://www.formula1.com/en/latest/article/third.4</link>
    </item>
  </channel>
</rss>`;

describe('decodeXmlEntities', () => {
  it('decodes named and numeric references once', () => {
    expect(decodeXmlEntities('Tom &amp; Jerry &#8217;s &#x27;x&#x27;')).toBe("Tom & Jerry ’s 'x'");
  });

  it('does not double-decode an escaped entity', () => {
    expect(decodeXmlEntities('&amp;#39;')).toBe('&#39;');
  });

  it('leaves out-of-range code points intact instead of aborting the feed', () => {
    expect(decodeXmlEntities('Bad &#999999999; and &#xFFFFFF;')).toBe('Bad &#999999999; and &#xFFFFFF;');
  });
});

describe('parseF1NewsPage', () => {
  it('keeps official article title links in order while skipping image links, navigation and duplicates', () => {
    const items = parseF1NewsPage(`
      <a href="/en/latest">Latest</a>
      <a href="/en/latest/article/one.1"><img src="one.jpg" alt="Photo" /></a>
      <a class="ArticleListCard_title" href="/en/latest/article/one.1">First &amp; <b>latest</b></a>
      <a href="https://www.formula1.com/en/latest/article/one.1">Duplicate</a>
      <a href='https://www.formula1.com/en/latest/article/two.2'>Second</a>
      <a href="https://attacker.example/en/latest/article/three.3">Other site</a>
      <a href="javascript:alert(1)">Bad scheme</a>
    `);

    expect(items).toEqual([
      { title: 'First & latest', link: 'https://www.formula1.com/en/latest/article/one.1', description: '' },
      { title: 'Second', link: 'https://www.formula1.com/en/latest/article/two.2', description: '' },
    ]);
  });

  it('limits fallback results and rejects an error page without articles', () => {
    expect(parseF1NewsPage('<html><h1>Service unavailable</h1></html>')).toEqual([]);
    expect(parseF1NewsPage('<a href="/en/latest/article/one.1">First</a><a href="/en/latest/article/two.2">Second</a>', 1)).toHaveLength(1);
  });
});

describe('parseF1NewsFeed', () => {
  it('returns valid items in feed order with decoded text', () => {
    const items = parseF1NewsFeed(SAMPLE_FEED);

    expect(items[0]).toEqual({
      title: 'Rwanda will write a new chapter in Africa’s rich F1 heritage',
      link: 'https://www.formula1.com/en/latest/article/rwanda.1',
      description: 'The bold agreement & more.',
    });
  });

  it('reads CDATA sections and strips markup from text', () => {
    const items = parseF1NewsFeed(SAMPLE_FEED);

    expect(items[1]).toEqual({
      title: 'Williams plans for 50th year',
      link: 'https://www.formula1.com/en/latest/article/williams.2',
      description: 'Anniversary events ’27',
    });
  });

  it('skips entries with a non-http link or an empty title', () => {
    const titles = parseF1NewsFeed(SAMPLE_FEED).map((item) => item.title);

    expect(titles).not.toContain('Bad scheme');
    expect(titles).toHaveLength(3);
    expect(titles[2]).toBe('Third valid item');
  });

  it('respects the limit', () => {
    expect(parseF1NewsFeed(SAMPLE_FEED, 1)).toHaveLength(1);
  });

  it('returns an empty list for a feed without items', () => {
    expect(parseF1NewsFeed('<rss><channel></channel></rss>')).toEqual([]);
  });
});
