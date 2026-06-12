export interface ScrapedOpportunity {
  title: string;
  description: string;
  company?: string;
  sourceId: string;
  sourcePlatform: string;
  sourceUrl: string;
  category: string;
  tags: string[];
  budget?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  location?: string;
  isRemote: boolean;
  postedAt: Date;
  relevanceScore: number;
  /** Number of people already applying / bidding, when the source exposes it */
  applicantCount?: number;
}

export async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GloutonBot/1.0; +https://glouton.facile.studio)',
        Accept: 'application/json, text/html, application/xml, */*',
        ...options?.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function parseRssDate(dateStr: string): Date {
  try {
    return new Date(dateStr);
  } catch {
    return new Date();
  }
}

export function extractTextBetween(html: string, open: string, close: string): string {
  const start = html.indexOf(open);
  if (start === -1) return '';
  const end = html.indexOf(close, start + open.length);
  if (end === -1) return '';
  return html.slice(start + open.length, end).trim();
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseRssItems(xml: string): Array<Record<string, string>> {
  const items: Array<Record<string, string>> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const item: Record<string, string> = {};
    const fields = ['title', 'link', 'description', 'pubDate', 'guid', 'author', 'category'];
    for (const field of fields) {
      const cdataMatch = block.match(new RegExp(`<${field}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${field}>`, 'i'));
      if (cdataMatch) {
        item[field] = cdataMatch[1].trim();
        continue;
      }
      const tagMatch = block.match(new RegExp(`<${field}[^>]*>([\\s\\S]*?)<\\/${field}>`, 'i'));
      if (tagMatch) item[field] = tagMatch[1].trim();
    }
    if (item.title && item.link) items.push(item);
  }
  return items;
}
