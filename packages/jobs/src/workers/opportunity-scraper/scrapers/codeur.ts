import { type ScrapedOpportunity, safeFetch, parseRssItems, stripHtml, parseRssDate } from './types';
import { scoreOpportunity, detectCategory } from './scoring';

// Codeur.com is the main French freelance platform for small/medium web projects
const FEEDS = [
  'https://www.codeur.com/projects.rss',
  'https://www.codeur.com/projects/web-development.rss',
  'https://www.codeur.com/projects/design.rss',
];

export async function scrapeCodeur(): Promise<ScrapedOpportunity[]> {
  const seen = new Set<string>();
  const results: ScrapedOpportunity[] = [];

  for (const feedUrl of FEEDS) {
    try {
      const res = await safeFetch(feedUrl, {
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
        if (score < 10) continue;

        results.push({
          title: item.title ?? '',
          description: desc.slice(0, 2000),
          sourceId: `codeur-${Buffer.from(id).toString('base64').slice(0, 32)}`,
          sourcePlatform: 'CODEUR',
          sourceUrl: item.link ?? '',
          category: detectCategory(item.title ?? '', desc),
          tags: ['codeur', 'france'],
          location: 'France',
          isRemote: true,
          postedAt: parseRssDate(item.pubDate ?? ''),
          relevanceScore: score,
        });
      }
    } catch (err) {
      console.error(`[Codeur] Failed for feed ${feedUrl}:`, err);
    }
  }

  return results;
}
