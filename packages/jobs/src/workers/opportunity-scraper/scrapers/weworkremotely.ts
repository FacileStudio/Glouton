import { type ScrapedOpportunity, safeFetch, parseRssItems, stripHtml, parseRssDate } from './types';
import { scoreOpportunity, detectCategory } from './scoring';

const FEEDS = [
  'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-design-jobs.rss',
];

export async function scrapeWeWorkRemotely(): Promise<ScrapedOpportunity[]> {
  const seen = new Set<string>();
  const results: ScrapedOpportunity[] = [];

  for (const feedUrl of FEEDS) {
    try {
      const res = await safeFetch(feedUrl, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRssItems(xml);

      for (const item of items) {
        const id = item.guid || item.link;
        if (!id || seen.has(id)) continue;
        seen.add(id);

        const desc = stripHtml(item.description ?? '');
        const score = scoreOpportunity(item.title ?? '', desc, true);
        if (score < 15) continue;

        results.push({
          title: item.title ?? '',
          description: desc.slice(0, 2000),
          company: extractCompany(item.title ?? ''),
          sourceId: `wwr-${Buffer.from(id).toString('base64').slice(0, 32)}`,
          sourcePlatform: 'WE_WORK_REMOTELY',
          sourceUrl: item.link ?? '',
          category: detectCategory(item.title ?? '', desc),
          tags: item.category ? [item.category] : [],
          location: item.region || undefined,
          isRemote: true,
          postedAt: parseRssDate(item.pubDate ?? ''),
          relevanceScore: score,
        });
      }
    } catch (err) {
      console.error(`[WWR] Failed for feed ${feedUrl}:`, err);
    }
  }

  return results;
}

function extractCompany(title: string): string | undefined {
  const match = title.match(/^(.+?)\s+(?:at|@|–|-)\s+/i);
  return match?.[1]?.trim();
}
