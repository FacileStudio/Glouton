import { type BoardQuery, type ScrapedOpportunity, kept, safeFetch, parseRssItems, stripHtml, parseRssDate } from './types';
import { scoreOpportunity, detectCategory } from './scoring';

// Codeur.com is the main French freelance platform for small/medium web projects
const FEEDS = [
  'https://www.codeur.com/projects.rss',
  'https://www.codeur.com/projects/web-development.rss',
  'https://www.codeur.com/projects/design.rss',
];

export async function scrapeCodeur(query?: BoardQuery): Promise<ScrapedOpportunity[]> {
  const seen = new Set<string>();
  const results: ScrapedOpportunity[] = [];

  for (const feedUrl of query ? FEEDS.slice(0, 1) : FEEDS) {
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

        // The first RSS paragraph carries structured metadata:
        // "<p>Budget : 500 € à 1 000 € - Catégories : WordPress, SEO</p>"
        const meta = parseMeta(item.description ?? '');
        const desc = stripHtml(stripMetaAndFooter(item.description ?? ''));
        const score = scoreOpportunity(item.title ?? '', desc, false);
        if (!kept(score, 10, query)) continue;

        results.push({
          title: item.title ?? '',
          description: desc.slice(0, 2000),
          sourceId: `codeur-${Buffer.from(id).toString('base64').slice(0, 32)}`,
          sourcePlatform: 'CODEUR',
          sourceUrl: item.link ?? '',
          category: detectCategory(item.title ?? '', desc),
          tags: meta.categories.length > 0 ? meta.categories : ['codeur', 'france'],
          budget: meta.budget || undefined,
          budgetMin: meta.budgetMin,
          budgetMax: meta.budgetMax,
          currency: meta.budget ? 'EUR' : undefined,
          location: 'France',
          isRemote: true,
          postedAt: parseRssDate(item.pubDate ?? ''),
          relevanceScore: score,
          contractType: 'Freelance',
        });
      }
    } catch (err) {
      console.error(`[Codeur] Failed for feed ${feedUrl}:`, err);
    }
  }

  if (!query) await enrichWithOfferCounts(results);

  return results;
}

interface CodeurMeta {
  budget: string | null;
  budgetMin?: number;
  budgetMax?: number;
  categories: string[];
}

function parseMeta(html: string): CodeurMeta {
  const meta: CodeurMeta = { budget: null, categories: [] };

  const match = html.match(/<p>\s*Budget\s*:\s*([^<]+?)\s*-\s*Catégories?\s*:\s*([^<]+?)\s*<\/p>/i);
  if (!match) return meta;

  meta.budget = stripHtml(match[1]);
  meta.categories = match[2]
    .split(',')
    .map((c) => stripHtml(c))
    .filter(Boolean);

  // "Moins de 500 €" / "500 € à 1 000 €" / "Plus de 10 000 €"
  const amounts = (meta.budget.match(/[\d\s .]+/g) ?? [])
    .map((n) => parseInt(n.replace(/[\s .]/g, ''), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (/moins de/i.test(meta.budget) && amounts[0]) {
    meta.budgetMax = amounts[0];
  } else if (/plus de/i.test(meta.budget) && amounts[0]) {
    meta.budgetMin = amounts[0];
  } else if (amounts.length >= 2) {
    meta.budgetMin = Math.min(...amounts);
    meta.budgetMax = Math.max(...amounts);
  } else if (amounts.length === 1) {
    meta.budgetMax = amounts[0];
  }

  return meta;
}

// Drop the metadata paragraph and the trailing "Voir ce projet sur Codeur"
// link so the stored description only contains the actual project brief.
function stripMetaAndFooter(html: string): string {
  return html
    .replace(/<p>\s*Budget\s*:[^<]*<\/p>/i, ' ')
    .replace(/<p>\s*<a[^>]*>\s*Voir ce projet sur Codeur\s*<\/a>\s*<\/p>/i, ' ');
}

// Codeur project pages show how many freelancers already made an offer
// ("N offres"). Fetch a capped number of pages to surface the competition
// level without hammering the site.
const MAX_OFFER_COUNT_FETCHES = 30;

async function enrichWithOfferCounts(results: ScrapedOpportunity[]): Promise<void> {
  const toEnrich = results.slice(0, MAX_OFFER_COUNT_FETCHES);

  for (const opp of toEnrich) {
    if (!opp.sourceUrl) continue;
    try {
      const res = await safeFetch(opp.sourceUrl, {
        headers: { Accept: 'text/html', 'Accept-Language': 'fr-FR,fr;q=0.9' },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const match = html.match(/(\d+)\s+offres?\b/i);
      if (match) {
        opp.applicantCount = parseInt(match[1], 10);
      }
      // Small delay to stay polite with Codeur
      await new Promise((r) => setTimeout(r, 250));
    } catch {
      // Non-blocking enrichment: skip on any failure
    }
  }
}
