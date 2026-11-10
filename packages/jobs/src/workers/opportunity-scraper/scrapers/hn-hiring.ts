import { type BoardQuery, type ScrapedOpportunity, kept, safeFetch } from './types';
import { scoreOpportunity, detectCategory } from './scoring';

interface AlgoliaHit {
  objectID: string;
  story_id?: number;
  comment_text?: string;
  author?: string;
  created_at?: string;
}

interface AlgoliaResponse {
  hits: AlgoliaHit[];
}

const QUERIES = [
  'freelance web developer',
  'freelance frontend svelte',
  'freelance designer remote',
  'seeking freelancer web',
];

export async function scrapeHNHiring(search?: BoardQuery): Promise<ScrapedOpportunity[]> {
  const seen = new Set<string>();
  const results: ScrapedOpportunity[] = [];

  for (const query of search?.terms ?? QUERIES) {
    try {
      const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=comment,ask_hn&hitsPerPage=30`;
      const res = await safeFetch(url);
      if (!res.ok) continue;
      const data = await res.json() as AlgoliaResponse;

      for (const hit of data.hits ?? []) {
        if (!hit.comment_text || !hit.objectID) continue;
        if (seen.has(hit.objectID)) continue;
        seen.add(hit.objectID);

        const text = hit.comment_text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text.length < 50) continue;

        const firstLine = text.split('\n')[0].slice(0, 120);
        const score = scoreOpportunity(firstLine, text, true);
        if (!kept(score, 20, search)) continue;

        const storyId = hit.story_id ?? hit.objectID;
        results.push({
          title: firstLine || 'HN Freelance Opportunity',
          description: text.slice(0, 2000),
          company: hit.author || undefined,
          sourceId: `hn-${hit.objectID}`,
          sourcePlatform: 'HACKER_NEWS',
          sourceUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
          category: detectCategory(firstLine, text),
          tags: ['hacker-news', 'freelance'],
          isRemote: true,
          postedAt: new Date(hit.created_at ?? Date.now()),
          relevanceScore: score,
        });
      }
    } catch (err) {
      console.error(`[HN] Failed for query "${query}":`, err);
    }
  }

  return results;
}
