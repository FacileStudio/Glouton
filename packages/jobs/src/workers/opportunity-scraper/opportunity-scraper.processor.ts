import { prisma } from '@repo/database';
import type { ScraperStats, OpportunityScraperResult, ScrapeProgress, NewOpportunitySummary } from './opportunity-scraper.types';
import { type ScrapedOpportunity, decodeEntities } from './scrapers/types';
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
    const newOpportunities: NewOpportunitySummary[] = [];
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
      const stat = await this.runScraper(scraper.name, scraper.fn, seenKeys, newOpportunities);
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
      newOpportunities,
      durationMs: Date.now() - start,
    };
  }

  private async runScraper(
    name: string,
    fn: ScraperFn,
    seenKeys: Set<string>,
    newOpportunities: NewOpportunitySummary[]
  ): Promise<ScraperStats> {
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
          const upserted = await this.upsertOpportunity(opp);
          stat.inserted++;
          if (upserted.isNew) {
            newOpportunities.push({
              id: upserted.id,
              title: opp.title,
              company: opp.company ?? null,
              source: name,
              budget: opp.budget ?? null,
              relevanceScore: opp.relevanceScore,
              url: opp.sourceUrl,
            });
          }
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

  // Last line of defense against HTML entities slipping through a scraper
  // (e.g. tags like "Creative &amp; Design").
  private sanitize(opp: ScrapedOpportunity): ScrapedOpportunity {
    const clean = (s: string) => decodeEntities(s).trim();
    return {
      ...opp,
      title: clean(opp.title),
      description: clean(opp.description),
      company: opp.company ? clean(opp.company) : opp.company,
      location: opp.location ? clean(opp.location) : opp.location,
      tags: [...new Set(opp.tags.map(clean).filter(Boolean))],
    };
  }

  private async upsertOpportunity(rawOpp: ScrapedOpportunity): Promise<{ id: string; isNew: boolean }> {
    const opp = this.sanitize(rawOpp);

    // Detect genuine creations (vs refreshes) so the worker can notify
    // webhook subscribers about truly new missions only.
    const existing = await prisma.opportunity.findUnique({
      where: { sourceId: opp.sourceId },
      select: { id: true },
    });

    // Shared between create and update: re-scraped rows get refreshed data
    // (cleaned entities, newly scraped detail fields) instead of staying
    // frozen at their first version.
    const refreshed = {
      title: opp.title,
      description: opp.description,
      company: opp.company ?? null,
      tags: opp.tags,
      budget: opp.budget ?? null,
      budgetMin: opp.budgetMin ?? null,
      budgetMax: opp.budgetMax ?? null,
      currency: opp.currency ?? null,
      location: opp.location ?? null,
      isRemote: opp.isRemote,
      relevanceScore: opp.relevanceScore,
      companyLogo: opp.companyLogo ?? null,
      contractType: opp.contractType ?? null,
      experienceLevel: opp.experienceLevel ?? null,
      duration: opp.duration ?? null,
    };

    const row = await prisma.opportunity.upsert({
      where: { sourceId: opp.sourceId },
      create: {
        ...refreshed,
        sourceId: opp.sourceId,
        sourcePlatform: opp.sourcePlatform as any,
        sourceUrl: opp.sourceUrl,
        category: opp.category as any,
        postedAt: opp.postedAt,
        applicantCount: opp.applicantCount ?? null,
      },
      update: {
        ...refreshed,
        ...(opp.applicantCount !== undefined ? { applicantCount: opp.applicantCount } : {}),
        updatedAt: new Date(),
      },
      select: { id: true },
    });

    return { id: row.id, isNew: !existing };
  }
}
