import { type BoardQuery, type ScrapedOpportunity, kept, safeFetch, stripHtml } from './types';
import { scoreOpportunity, detectCategory } from './scoring';

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  company_logo: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

const JOB_TYPE_LABELS: Record<string, string> = {
  full_time: 'Temps plein',
  part_time: 'Temps partiel',
  contract: 'Contrat / Freelance',
  freelance: 'Freelance',
  internship: 'Stage',
};

const CATEGORIES = [
  'software-dev',
  'design',
  'frontend',
  'backend',
  'devops',
];

export async function scrapeRemotive(query?: BoardQuery): Promise<ScrapedOpportunity[]> {
  const results: ScrapedOpportunity[] = [];
  const urls = query
    ? query.terms.map((term) => `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(term)}&limit=50`)
    : CATEGORIES.map((cat) => `https://remotive.com/api/remote-jobs?category=${cat}&limit=50`);

  for (const url of urls) {
    try {
      const res = await safeFetch(url);
      if (!res.ok) continue;
      const data = await res.json() as { jobs: RemotiveJob[] };

      for (const job of data.jobs ?? []) {
        const desc = stripHtml(job.description ?? '');
        const score = scoreOpportunity(job.title, desc, true);
        if (!kept(score, 15, query)) continue;

        const salary = parseSalary(job.salary);

        results.push({
          title: job.title,
          description: desc.slice(0, 2000),
          company: job.company_name,
          sourceId: `remotive-${job.id}`,
          sourcePlatform: 'REMOTIVE',
          sourceUrl: job.url,
          category: detectCategory(job.title, desc),
          tags: job.tags ?? [],
          budget: job.salary || undefined,
          budgetMin: salary.min,
          budgetMax: salary.max,
          currency: salary.currency,
          location: job.candidate_required_location || undefined,
          isRemote: true,
          postedAt: new Date(job.publication_date),
          relevanceScore: score,
          companyLogo: job.company_logo || undefined,
          contractType: JOB_TYPE_LABELS[job.job_type] ?? job.job_type ?? undefined,
        });
      }
    } catch (err) {
      console.error(`[Remotive] Failed for ${url}:`, err);
    }
  }

  return results;
}

function parseSalary(salary: string): { min?: number; max?: number; currency?: string } {
  if (!salary) return {};
  const nums = salary.match(/[\d,]+/g)?.map((n) => parseInt(n.replace(',', ''), 10)).filter(Boolean) ?? [];
  const currency = salary.includes('€') ? 'EUR' : salary.includes('£') ? 'GBP' : 'USD';
  if (nums.length >= 2) return { min: Math.min(...nums), max: Math.max(...nums), currency };
  if (nums.length === 1) return { min: nums[0], currency };
  return {};
}
