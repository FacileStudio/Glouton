import { type ScrapedOpportunity, safeFetch, stripHtml } from './types';
import { scoreOpportunity, detectCategory } from './scoring';

interface HimalayasJob {
  title: string;
  excerpt?: string;
  description?: string;
  companyName?: string;
  companySlug?: string;
  employmentType?: string;
  minSalary?: number | null;
  maxSalary?: number | null;
  currency?: string;
  salaryPeriod?: string;
  seniority?: string[];
  locationRestrictions?: string[];
  timezoneRestrictions?: number[];
  categories?: string[];
  applicationLink?: string;
  guid?: string;
  pubDate?: number;
  expiryDate?: number;
}

interface HimalayasResponse {
  jobs: HimalayasJob[];
}

export async function scrapeHimalayas(): Promise<ScrapedOpportunity[]> {
  const results: ScrapedOpportunity[] = [];

  try {
    const res = await safeFetch('https://himalayas.app/jobs/api?limit=100');
    if (!res.ok) return results;
    const data = await res.json() as HimalayasResponse;

    for (const job of data.jobs ?? []) {
      if (!job.title || !job.guid) continue;

      const desc = stripHtml(job.description || job.excerpt || '');
      const score = scoreOpportunity(job.title, desc, true, job.minSalary ?? undefined);
      if (score < 15) continue;

      const budget = job.minSalary
        ? `${job.minSalary}${job.maxSalary ? `-${job.maxSalary}` : ''} ${job.currency ?? 'USD'}${job.salaryPeriod ? `/${job.salaryPeriod}` : ''}`
        : undefined;

      results.push({
        title: job.title,
        description: desc.slice(0, 2000),
        company: job.companyName || undefined,
        sourceId: `himalayas-${job.guid}`,
        sourcePlatform: 'HIMALAYAS',
        sourceUrl: job.applicationLink || `https://himalayas.app/companies/${job.companySlug ?? ''}`,
        category: detectCategory(job.title, desc),
        tags: [...(job.categories ?? []), ...(job.seniority ?? [])],
        budget,
        budgetMin: job.minSalary ?? undefined,
        budgetMax: job.maxSalary ?? undefined,
        currency: job.currency || 'USD',
        location: job.locationRestrictions?.join(', ') || undefined,
        isRemote: true,
        postedAt: job.pubDate ? new Date(job.pubDate * 1000) : new Date(),
        relevanceScore: score,
      });
    }
  } catch (err) {
    console.error('[Himalayas] Failed:', err);
  }

  return results;
}
