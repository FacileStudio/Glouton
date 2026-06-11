import { prisma } from '@repo/database';
import type { ScraperStats, OpportunityScraperResult } from './opportunity-scraper.types';
import type { ScrapedOpportunity } from './scrapers/types';
import { scrapeRemotive } from './scrapers/remotive';
import { scrapeRemoteOK } from './scrapers/remoteok';
import { scrapeWeWorkRemotely } from './scrapers/weworkremotely';
import { scrapeHNHiring } from './scrapers/hn-hiring';
import { scrapeIndeed } from './scrapers/indeed';
import { scrapeMalt } from './scrapers/malt';
import { scrapeCodeur } from './scrapers/codeur';

type ScraperFn = () => Promise<ScrapedOpportunity[]>;

const SCRAPERS: Array<{ name: string; fn: ScraperFn }> = [
  { name: 'Remotive', fn: scrapeRemotive },
  { name: 'RemoteOK', fn: scrapeRemoteOK },
  { name: 'WeWorkRemotely', fn: scrapeWeWorkRemotely },
  { name: 'HackerNews', fn: scrapeHNHiring },
  { name: 'Indeed', fn: scrapeIndeed },
  { name: 'Malt', fn: scrapeMalt },
  { name: 'Codeur', fn: scrapeCodeur },
];

export class OpportunityScraperProcessor {
  async process(): Promise<OpportunityScraperResult> {
    const start = Date.now();
    const stats: ScraperStats[] = [];
    let totalInserted = 0;
    let totalFound = 0;

    for (const scraper of SCRAPERS) {
      const stat = await this.runScraper(scraper.name, scraper.fn);
      stats.push(stat);
      totalFound += stat.found;
      totalInserted += stat.inserted;
    }

    return {
      stats,
      totalInserted,
      totalFound,
      durationMs: Date.now() - start,
    };
  }

  private async runScraper(name: string, fn: ScraperFn): Promise<ScraperStats> {
    const stat: ScraperStats = { source: name, found: 0, inserted: 0, skipped: 0 };

    try {
      const opportunities = await fn();
      stat.found = opportunities.length;

      for (const opp of opportunities) {
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
      },
      update: {
        relevanceScore: opp.relevanceScore,
        updatedAt: new Date(),
      },
    });
  }
}
