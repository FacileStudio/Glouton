import { type ScrapedOpportunity, safeFetch } from './types';
import { scoreOpportunity, detectCategory } from './scoring';

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

const CATEGORIES = [
  'software-dev',
  'design',
  'frontend',
  'backend',
  'devops',
];

export async function scrapeRemotive(): Promise<ScrapedOpportunity[]> {
  const results: ScrapedOpportunity[] = [];

  for (const cat of CATEGORIES) {
    try {
      const res = await safeFetch(`https://remotive.com/api/remote-jobs?category=${cat}&limit=50`);
      if (!res.ok) continue;
      const data = await res.json() as { jobs: RemotiveJob[] };

      for (const job of data.jobs ?? []) {
        const score = scoreOpportunity(job.title, job.description, true);
        if (score < 15) continue;

        const salary = parseSalary(job.salary);

        results.push({
          title: job.title,
          description: job.description.slice(0, 2000),
          company: job.company_name,
          sourceId: `remotive-${job.id}`,
          sourcePlatform: 'REMOTIVE',
          sourceUrl: job.url,
          category: detectCategory(job.title, job.description),
          tags: job.tags ?? [],
          budget: job.salary || undefined,
          budgetMin: salary.min,
          budgetMax: salary.max,
          currency: salary.currency,
          location: job.candidate_required_location || undefined,
          isRemote: true,
          postedAt: new Date(job.publication_date),
          relevanceScore: score,
        });
      }
    } catch (err) {
      console.error(`[Remotive] Failed for category ${cat}:`, err);
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
