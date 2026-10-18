export interface F1NewsItem {
  title: string;
  link: string;
  description: string;
}

export const F1_NEWS_FEED_URL = 'https://www.formula1.com/en/latest/all.xml';
export const F1_NEWS_PAGE_URL = 'https://www.formula1.com/en/latest';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decode XML/HTML entities once. Numeric refs first, `&amp;` last, so `&amp;#39;` stays literal. */
export function decodeXmlEntities(value: string): string {
  const decodeCodePoint = (match: string, codePoint: number): string => (
    Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : match
  );
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex: string) => decodeCodePoint(match, parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (match, dec: string) => decodeCodePoint(match, parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name] ?? match);
}

/** Inner text of a tag, unescaped from CDATA when wrapped; entities are left for the caller to decode. */
function readTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  if (!match) return '';

  const raw = match[1].trim();
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1].trim() : raw;
}

/** Feed text may be escaped HTML or CDATA HTML, so decode entities, then strip tags, then tidy whitespace. */
function toPlainText(raw: string): string {
  return decodeXmlEntities(raw)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Parse an RSS 2.0 document into news items, keeping feed order and skipping entries without a usable title or http(s) link. */
export function parseF1NewsFeed(xml: string, limit = 6): F1NewsItem[] {
  const items: F1NewsItem[] = [];

  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    if (items.length >= limit) break;

    const block = match[1];
    const title = toPlainText(readTag(block, 'title'));
    const link = decodeXmlEntities(readTag(block, 'link')).trim();
    const description = toPlainText(readTag(block, 'description'));

    if (!title || !isHttpUrl(link)) continue;
    items.push({ title, link, description });
  }

  return items;
}

/** Use article-title links on the official listing when its RSS endpoint is unavailable. */
export function parseF1NewsPage(html: string, limit = 6): F1NewsItem[] {
  const items: F1NewsItem[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (items.length >= limit) break;
    const href = match[1].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!href) continue;

    try {
      const url = new URL(decodeXmlEntities(href), F1_NEWS_PAGE_URL);
      if (url.origin !== 'https://www.formula1.com' || !url.pathname.startsWith('/en/latest/article/')) continue;
      const title = toPlainText(match[2]);
      if (!title || seen.has(url.href)) continue;
      seen.add(url.href);
      items.push({ title, link: url.href, description: '' });
    } catch {
      // Ignore malformed URLs without discarding the remaining headlines.
    }
  }

  return items;
}
