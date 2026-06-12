// Jobicy free API — per their notice: credit Jobicy, link users to their site,
// and fetch only a few times per day (our scraper runs every 3h, within limits).
import { type ScrapedOpportunity, safeFetch, stripHtml } from './types';
import { scoreOpportunity, detectCategory } from './scoring';

interface JobicyJob {
  id: number;
  url: string;
  jobSlug: string;
  jobTitle: string;
  companyName: string;
  companyLogo?: string;
  jobIndustry?: string[] | string;
  jobType?: string[] | string;
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
}

interface JobicyResponse {
  jobs: JobicyJob[];
}

const TAGS = ['web', 'design'];

export async function scrapeJobicy(): Promise<ScrapedOpportunity[]> {
  const seen = new Set<number>();
  const results: ScrapedOpportunity[] = [];

  for (const tag of TAGS) {
    try {
      const res = await safeFetch(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${tag}`);
      if (!res.ok) continue;
      const data = await res.json() as JobicyResponse;

      for (const job of data.jobs ?? []) {
        if (!job.id || !job.jobTitle) continue;
        if (seen.has(job.id)) continue;
        seen.add(job.id);

        const desc = stripHtml(job.jobDescription || job.jobExcerpt || '');
        const score = scoreOpportunity(job.jobTitle, desc, true);
        if (score < 15) continue;

        results.push({
          title: job.jobTitle,
          description: desc.slice(0, 2000),
          company: job.companyName || undefined,
          sourceId: `jobicy-${job.id}`,
          sourcePlatform: 'JOBICY',
          sourceUrl: job.url,
          category: detectCategory(job.jobTitle, desc),
          tags: toArray(job.jobIndustry),
          location: job.jobGeo || undefined,
          isRemote: true,
          postedAt: new Date(job.pubDate ?? Date.now()),
          relevanceScore: score,
          companyLogo: job.companyLogo || undefined,
          contractType: toArray(job.jobType).join(', ') || undefined,
          experienceLevel: job.jobLevel && job.jobLevel !== 'Any' ? job.jobLevel : undefined,
        });
      }
    } catch (err) {
      console.error(`[Jobicy] Failed for tag ${tag}:`, err);
    }
  }

  return results;
}

function toArray(value: string[] | string | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
