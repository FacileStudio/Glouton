import { type ScrapedOpportunity, safeFetch, parseRssItems, stripHtml, parseRssDate } from './types';
import { scoreOpportunity, detectCategory } from './scoring';

const FEEDS = [
  { url: 'https://fr.indeed.com/rss?q=développeur+freelance&l=France&sort=date', country: 'France' },
  { url: 'https://fr.indeed.com/rss?q=web+designer+freelance&l=France&sort=date', country: 'France' },
  { url: 'https://fr.indeed.com/rss?q=développeur+svelte&l=&sort=date', country: 'France' },
  { url: 'https://fr.indeed.com/rss?q=développeur+go+freelance&sort=date', country: 'France' },
];

export async function scrapeIndeed(): Promise<ScrapedOpportunity[]> {
  const seen = new Set<string>();
  const results: ScrapedOpportunity[] = [];

  for (const feed of FEEDS) {
    try {
      const res = await safeFetch(feed.url, {
        headers: {
          Accept: 'application/rss+xml, text/xml',
          'Accept-Language': 'fr-FR,fr;q=0.9',
        },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRssItems(xml);

      for (const item of items) {
        const id = item.guid || item.link;
        if (!id || seen.has(id)) continue;
        seen.add(id);

        const desc = stripHtml(item.description ?? '');
        const score = scoreOpportunity(item.title ?? '', desc, false);
        if (score < 15) continue;

        results.push({
          title: item.title ?? '',
          description: desc.slice(0, 2000),
          company: extractCompany(item.title ?? ''),
          sourceId: `indeed-${Buffer.from(id).toString('base64').slice(0, 32)}`,
          sourcePlatform: 'INDEED',
          sourceUrl: item.link ?? '',
          category: detectCategory(item.title ?? '', desc),
          tags: [],
          location: feed.country,
          isRemote: desc.toLowerCase().includes('télétravail') || desc.toLowerCase().includes('remote') || desc.toLowerCase().includes('full remote'),
          postedAt: parseRssDate(item.pubDate ?? ''),
          relevanceScore: score,
        });
      }
    } catch (err) {
      console.error(`[Indeed] Failed for feed ${feed.url}:`, err);
    }
  }

  return results;
}

function extractCompany(title: string): string | undefined {
  const match = title.match(/[-–]\s*(.+)$/);
  return match?.[1]?.trim();
}
