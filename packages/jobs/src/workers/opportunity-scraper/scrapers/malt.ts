import { type ScrapedOpportunity, safeFetch } from './types';
import { scoreOpportunity, detectCategory } from './scoring';

const SEARCHES = [
  { q: 'développeur+sveltekit', label: 'sveltekit' },
  { q: 'développeur+go', label: 'golang' },
  { q: 'web+designer+freelance', label: 'design' },
  { q: 'développeur+typescript', label: 'typescript' },
  { q: 'création+site+web', label: 'site web' },
];

export async function scrapeMalt(): Promise<ScrapedOpportunity[]> {
  const seen = new Set<string>();
  const results: ScrapedOpportunity[] = [];

  for (const search of SEARCHES) {
    try {
      const url = `https://www.malt.fr/s?q=${search.q}&type=PROJECT`;
      const res = await safeFetch(url, {
        headers: {
          Accept: 'text/html',
          'Accept-Language': 'fr-FR,fr;q=0.9',
          'Cache-Control': 'no-cache',
        },
      });
      if (!res.ok) continue;
      const html = await res.text();

      const extracted = extractMaltProjects(html);
      for (const proj of extracted) {
        if (seen.has(proj.sourceId)) continue;
        seen.add(proj.sourceId);

        const score = scoreOpportunity(proj.title, proj.description, proj.isRemote);
        if (score < 10) continue;

        results.push({ ...proj, relevanceScore: score });
      }
    } catch (err) {
      console.error(`[Malt] Failed for query ${search.q}:`, err);
    }
  }

  return results;
}

function extractMaltProjects(html: string): Omit<ScrapedOpportunity, 'relevanceScore'>[] {
  const results: Omit<ScrapedOpportunity, 'relevanceScore'>[] = [];

  // Malt embeds project data in __NUXT_DATA__ or similar JSON blobs
  const jsonMatches = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const scriptTag of jsonMatches) {
    const content = scriptTag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
    try {
      const data = JSON.parse(content);
      const projects = extractProjectsFromJson(data);
      results.push(...projects);
    } catch {}
  }

  // Fallback: parse HTML cards
  if (results.length === 0) {
    const cardRegex = /<article[^>]*class="[^"]*project[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const card = match[1];
      const title = extractTag(card, 'h2') || extractTag(card, 'h3') || extractTag(card, 'a');
      const desc = extractTag(card, 'p');
      const href = extractAttr(card, 'a', 'href');
      if (!title) continue;

      const id = href ? `malt-${Buffer.from(href).toString('base64').slice(0, 24)}` : `malt-${Date.now()}-${Math.random()}`;
      results.push({
        title: cleanText(title),
        description: cleanText(desc),
        sourceId: id,
        sourcePlatform: 'MALT',
        sourceUrl: href?.startsWith('http') ? href : href ? `https://www.malt.fr${href}` : 'https://www.malt.fr',
        category: detectCategory(title, desc),
        tags: ['malt', 'france'],
        location: 'France',
        isRemote: true,
        postedAt: new Date(),
      });
    }
  }

  return results;
}

function extractProjectsFromJson(data: any): Omit<ScrapedOpportunity, 'relevanceScore'>[] {
  const results: Omit<ScrapedOpportunity, 'relevanceScore'>[] = [];
  if (!data || typeof data !== 'object') return results;

  const items: any[] = [];
  findProjectItems(data, items, 0);

  for (const item of items) {
    const title = item.title || item.name || item.projectTitle;
    if (!title || typeof title !== 'string') continue;
    const desc = item.description || item.content || '';
    const id = item.id || item.projectId || item.slug;
    if (!id) continue;

    results.push({
      title: String(title).slice(0, 200),
      description: String(desc).slice(0, 2000),
      company: item.company || item.clientName || undefined,
      sourceId: `malt-${id}`,
      sourcePlatform: 'MALT',
      sourceUrl: item.url || `https://www.malt.fr/project/${id}`,
      category: detectCategory(title, desc),
      tags: Array.isArray(item.tags) ? item.tags.map(String) : ['malt'],
      budget: item.budget || item.price || undefined,
      location: 'France',
      isRemote: true,
      postedAt: new Date(item.createdAt || item.publishedAt || Date.now()),
    });
  }
  return results;
}

function findProjectItems(obj: any, out: any[], depth: number): void {
  if (depth > 8 || !obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === 'object' && (item.title || item.projectTitle)) {
        out.push(item);
      } else {
        findProjectItems(item, out, depth + 1);
      }
    }
  } else {
    for (const val of Object.values(obj)) {
      findProjectItems(val, out, depth + 1);
    }
  }
}

function extractTag(html: string, tag: string): string {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? cleanText(match[1]) : '';
}

function extractAttr(html: string, tag: string, attr: string): string {
  const match = html.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i'));
  return match?.[1] ?? '';
}

function cleanText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}
