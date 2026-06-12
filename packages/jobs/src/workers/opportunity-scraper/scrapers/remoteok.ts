import { type ScrapedOpportunity, safeFetch, stripHtml } from './types';
import { scoreOpportunity, detectCategory } from './scoring';

interface RemoteOkJob {
  id: string;
  url: string;
  position: string;
  company: string;
  company_logo?: string;
  logo?: string;
  tags: string[];
  date: string;
  description: string;
  salary_min?: number;
  salary_max?: number;
  location?: string;
}

const SEARCH_TAGS = ['svelte', 'typescript', 'javascript', 'design', 'frontend', 'golang'];

export async function scrapeRemoteOK(): Promise<ScrapedOpportunity[]> {
  const seen = new Set<string>();
  const results: ScrapedOpportunity[] = [];

  for (const tag of SEARCH_TAGS) {
    try {
      const res = await safeFetch(`https://remoteok.com/api?tag=${tag}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GloutonBot/1.0)' },
      });
      if (!res.ok) continue;
      const data = await res.json() as Array<RemoteOkJob | { legal?: string }>;

      for (const item of data) {
        if (!('position' in item) || !item.id) continue;
        const job = item as RemoteOkJob;
        if (seen.has(job.id)) continue;
        seen.add(job.id);

        const desc = stripHtml(job.description ?? '');
        const score = scoreOpportunity(job.position, desc, true, job.salary_min);
        if (score < 15) continue;

        results.push({
          title: job.position,
          description: desc.slice(0, 2000),
          company: job.company || undefined,
          sourceId: `remoteok-${job.id}`,
          sourcePlatform: 'REMOTEOK',
          sourceUrl: job.url?.startsWith('http') ? job.url : `https://remoteok.com/remote-jobs/${job.id}`,
          category: detectCategory(job.position, desc),
          tags: job.tags ?? [],
          budgetMin: job.salary_min ?? undefined,
          budgetMax: job.salary_max ?? undefined,
          currency: 'USD',
          location: job.location || undefined,
          isRemote: true,
          postedAt: new Date(parseInt(job.date ?? '0') * 1000 || Date.now()),
          relevanceScore: score,
          companyLogo: job.company_logo || job.logo || undefined,
        });
      }
    } catch (err) {
      console.error(`[RemoteOK] Failed for tag ${tag}:`, err);
    }
  }

  return results;
}
