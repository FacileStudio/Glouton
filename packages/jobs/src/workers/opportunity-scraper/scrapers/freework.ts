import { type ScrapedOpportunity, safeFetch, stripHtml } from './types';
import { scoreOpportunity, detectCategory } from './scoring';

interface FreeWorkJobPosting {
  id: number;
  title: string;
  slug: string;
  description?: string;
  candidateProfile?: string;
  company?: { name?: string };
  skills?: Array<{ name?: string }>;
  minDailySalary?: number | null;
  maxDailySalary?: number | null;
  minAnnualSalary?: number | null;
  maxAnnualSalary?: number | null;
  currency?: string;
  remoteMode?: string;
  duration?: number | null;
  durationPeriod?: string | null;
  publishedAt?: string;
  contracts?: string[];
  experienceLevel?: string;
  location?: { label?: string; shortLabel?: string };
  applicationUrl?: string | null;
}

// Depending on the Accept header the API answers either a plain JSON array
// or a Hydra collection ({ 'hydra:member': [...] }). Handle both.
type FreeWorkResponse = FreeWorkJobPosting[] | { 'hydra:member'?: FreeWorkJobPosting[] };

function extractJobs(data: FreeWorkResponse): FreeWorkJobPosting[] {
  if (Array.isArray(data)) return data;
  return data['hydra:member'] ?? [];
}

const SEARCH_KEYWORDS = [
  'sveltekit',
  'svelte',
  'développeur web freelance',
  'site vitrine',
  'golang',
  'ui ux designer',
  'frontend typescript',
];

export async function scrapeFreeWork(): Promise<ScrapedOpportunity[]> {
  const seen = new Set<number>();
  const results: ScrapedOpportunity[] = [];

  for (const keywords of SEARCH_KEYWORDS) {
    try {
      const url = `https://www.free-work.com/api/job_postings?itemsPerPage=30&searchKeywords=${encodeURIComponent(keywords)}`;
      const res = await safeFetch(url);
      if (!res.ok) continue;
      const data = await res.json() as FreeWorkResponse;

      for (const job of extractJobs(data)) {
        if (!job.id || !job.title) continue;
        if (seen.has(job.id)) continue;
        seen.add(job.id);

        const desc = stripHtml(`${job.description ?? ''} ${job.candidateProfile ?? ''}`);
        const isRemote = !!job.remoteMode && job.remoteMode !== 'none';
        const score = scoreOpportunity(job.title, desc, isRemote, job.minDailySalary ?? undefined);
        if (score < 15) continue;

        const isFreelanceContract = (job.contracts ?? []).some((c) => c.includes('contractor') || c.includes('freelance'));
        const budget = formatBudget(job);

        results.push({
          title: job.title,
          description: desc.slice(0, 2000),
          company: job.company?.name || undefined,
          sourceId: `freework-${job.id}`,
          sourcePlatform: 'FREE_WORK',
          sourceUrl: job.applicationUrl || `https://www.free-work.com/fr/tech-it/developpeur/job-mission/${job.slug}`,
          category: detectCategory(job.title, desc),
          tags: [
            ...(job.skills ?? []).map((s) => s.name).filter((n): n is string => !!n),
            ...(isFreelanceContract ? ['freelance'] : []),
          ],
          budget: budget || undefined,
          budgetMin: job.minDailySalary ?? job.minAnnualSalary ?? undefined,
          budgetMax: job.maxDailySalary ?? job.maxAnnualSalary ?? undefined,
          currency: job.currency || 'EUR',
          location: job.location?.shortLabel || job.location?.label || undefined,
          isRemote,
          postedAt: new Date(job.publishedAt ?? Date.now()),
          relevanceScore: score,
        });
      }
    } catch (err) {
      console.error(`[FreeWork] Failed for keywords "${keywords}":`, err);
    }
  }

  return results;
}

function formatBudget(job: FreeWorkJobPosting): string | null {
  const currency = job.currency === 'EUR' || !job.currency ? '€' : job.currency;
  if (job.minDailySalary && job.maxDailySalary) {
    return `${job.minDailySalary}-${job.maxDailySalary}${currency}/jour`;
  }
  if (job.minDailySalary) return `${job.minDailySalary}${currency}/jour`;
  if (job.minAnnualSalary && job.maxAnnualSalary) {
    return `${job.minAnnualSalary}-${job.maxAnnualSalary}${currency}/an`;
  }
  if (job.minAnnualSalary) return `${job.minAnnualSalary}${currency}/an`;
  return null;
}
