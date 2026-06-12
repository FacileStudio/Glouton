import { prisma } from '@repo/database';
import type { ScraperStats, OpportunityScraperResult, ScrapeProgress } from './opportunity-scraper.types';
import type { ScrapedOpportunity } from './scrapers/types';
import { scrapeRemotive } from './scrapers/remotive';
import { scrapeRemoteOK } from './scrapers/remoteok';
import { scrapeWeWorkRemotely } from './scrapers/weworkremotely';
import { scrapeHNHiring } from './scrapers/hn-hiring';
import { scrapeCodeur } from './scrapers/codeur';
import { scrapeFreeWork } from './scrapers/freework';
import { scrapeJobicy } from './scrapers/jobicy';
import { scrapeHimalayas } from './scrapers/himalayas';

type ScraperFn = () => Promise<ScrapedOpportunity[]>;

const SCRAPERS: Array<{ name: string; fn: ScraperFn }> = [
  { name: 'FreeWork', fn: scrapeFreeWork },
  { name: 'Codeur', fn: scrapeCodeur },
  { name: 'Remotive', fn: scrapeRemotive },
  { name: 'RemoteOK', fn: scrapeRemoteOK },
  { name: 'WeWorkRemotely', fn: scrapeWeWorkRemotely },
  { name: 'HackerNews', fn: scrapeHNHiring },
  { name: 'Jobicy', fn: scrapeJobicy },
  { name: 'Himalayas', fn: scrapeHimalayas },
];

export class OpportunityScraperProcessor {
  async process(onProgress?: (progress: ScrapeProgress) => void): Promise<OpportunityScraperResult> {
    const start = Date.now();
    const stats: ScraperStats[] = [];
    const seenKeys = new Set<string>();
    let totalInserted = 0;
    let totalFound = 0;

    onProgress?.({
      percent: 0,
      source: SCRAPERS[0].name,
      sourcesDone: 0,
      sourcesTotal: SCRAPERS.length,
      totalInserted: 0,
      totalFound: 0,
    });

    for (let i = 0; i < SCRAPERS.length; i++) {
      const scraper = SCRAPERS[i];
      const stat = await this.runScraper(scraper.name, scraper.fn, seenKeys);
      stats.push(stat);
      totalFound += stat.found;
      totalInserted += stat.inserted;

      onProgress?.({
        percent: Math.round(((i + 1) / SCRAPERS.length) * 100),
        source: SCRAPERS[i + 1]?.name ?? scraper.name,
        sourcesDone: i + 1,
        sourcesTotal: SCRAPERS.length,
        totalInserted,
        totalFound,
      });
    }

    return {
      stats,
      totalInserted,
      totalFound,
      durationMs: Date.now() - start,
    };
  }

  private async runScraper(name: string, fn: ScraperFn, seenKeys: Set<string>): Promise<ScraperStats> {
    const stat: ScraperStats = { source: name, found: 0, inserted: 0, skipped: 0 };

    try {
      const opportunities = await fn();
      stat.found = opportunities.length;

      for (const opp of opportunities) {
        // Cross-source dedup: same job is often cross-posted on multiple boards
        const dedupKey = this.dedupKey(opp);
        if (seenKeys.has(dedupKey)) {
          stat.skipped++;
          continue;
        }
        seenKeys.add(dedupKey);

        try {
          await this.upsertOpportunity(opp);
          stat.inserted++;
        } catch (err: any) {
          if (err?.code === 'P2002') {
            stat.skipped++;
          } else {
            console.error(`[OpportunityScraper:${name}] Upsert failed:`, err?.message);
            stat.skipped++;
          }
        }
      }
    } catch (err: any) {
      stat.error = err?.message ?? 'Unknown error';
      console.error(`[OpportunityScraper:${name}] Scraper failed:`, err?.message);
    }

    console.log(`[OpportunityScraper:${name}] found=${stat.found} inserted=${stat.inserted} skipped=${stat.skipped}${stat.error ? ` error=${stat.error}` : ''}`);
    return stat;
  }

  private dedupKey(opp: ScrapedOpportunity): string {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return `${normalize(opp.title)}::${normalize(opp.company ?? '')}`;
  }

  private async upsertOpportunity(opp: ScrapedOpportunity): Promise<void> {
    await prisma.opportunity.upsert({
      where: { sourceId: opp.sourceId },
      create: {
        title: opp.title,
        description: opp.description,
        company: opp.company ?? null,
        sourceId: opp.sourceId,
        sourcePlatform: opp.sourcePlatform as any,
        sourceUrl: opp.sourceUrl,
        category: opp.category as any,
        tags: opp.tags,
        budget: opp.budget ?? null,
        budgetMin: opp.budgetMin ?? null,
        budgetMax: opp.budgetMax ?? null,
        currency: opp.currency ?? null,
        location: opp.location ?? null,
        isRemote: opp.isRemote,
        postedAt: opp.postedAt,
        relevanceScore: opp.relevanceScore,
        applicantCount: opp.applicantCount ?? null,
      },
      update: {
        relevanceScore: opp.relevanceScore,
        ...(opp.applicantCount !== undefined ? { applicantCount: opp.applicantCount } : {}),
        updatedAt: new Date(),
      },
    });
  }
}
