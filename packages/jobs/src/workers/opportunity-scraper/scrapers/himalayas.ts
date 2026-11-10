import { type BoardQuery, type ScrapedOpportunity, kept, safeFetch, stripHtml } from './types';
import { scoreOpportunity, detectCategory } from './scoring';

interface HimalayasJob {
  title: string;
  excerpt?: string;
  description?: string;
  companyName?: string;
  companySlug?: string;
  companyLogo?: string;
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

async function himalayasJobs(query?: BoardQuery): Promise<HimalayasJob[]> {
  if (!query) {
    const res = await safeFetch('https://himalayas.app/jobs/api?limit=100');
    return res.ok ? ((await res.json()) as HimalayasResponse).jobs ?? [] : [];
  }
  const jobs: HimalayasJob[] = [];
  for (const term of query.terms) {
    const res = await safeFetch(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(term)}`);
    if (res.ok) jobs.push(...(((await res.json()) as HimalayasResponse).jobs ?? []));
  }
  return jobs;
}

export async function scrapeHimalayas(query?: BoardQuery): Promise<ScrapedOpportunity[]> {
  const results: ScrapedOpportunity[] = [];
  const seen = new Set<string>();

  try {
    for (const job of await himalayasJobs(query)) {
      if (!job.title || !job.guid || seen.has(job.guid)) continue;
      seen.add(job.guid);

      const desc = stripHtml(job.description || job.excerpt || '');
      const score = scoreOpportunity(job.title, desc, true, job.minSalary ?? undefined);
      if (!kept(score, 15, query)) continue;

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
        tags: job.categories ?? [],
        budget,
        budgetMin: job.minSalary ?? undefined,
        budgetMax: job.maxSalary ?? undefined,
        currency: job.currency || 'USD',
        location: job.locationRestrictions?.join(', ') || undefined,
        isRemote: true,
        postedAt: job.pubDate ? new Date(job.pubDate * 1000) : new Date(),
        relevanceScore: score,
        companyLogo: job.companyLogo || undefined,
        contractType: job.employmentType || undefined,
        experienceLevel: job.seniority?.join(', ') || undefined,
      });
    }
  } catch (err) {
    console.error('[Himalayas] Failed:', err);
  }

  return results;
}
