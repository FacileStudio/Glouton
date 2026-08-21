import type { Job as BullJob } from 'bullmq';
import { dispatchWebhookEvent } from '@repo/webhooks';
import type { JobDefinition } from '../../types';
import type { EventEmitter } from '../index';
import { OpportunityScraperProcessor } from './opportunity-scraper.processor';
import type { OpportunityScraperData } from './opportunity-scraper.types';

export function createOpportunityScraperWorker(events?: EventEmitter): JobDefinition<OpportunityScraperData, void> {
  const processor = new OpportunityScraperProcessor();

  return {
    name: 'opportunity-scraper',
    processor: async (job: BullJob<OpportunityScraperData>) => {
      console.log('[OpportunityScraper] Starting scrape run...');
      try {
        const result = await processor.process((progress) => {
          // Opportunities are global, so progress is broadcast to everyone
          events?.broadcast('opportunity:scrape:progress', progress);
          job.updateProgress(progress.percent).catch(() => {});
        });
        console.log(`[OpportunityScraper] Done: ${result.totalInserted} new opportunities in ${result.durationMs}ms`);
        events?.broadcast('opportunity:scrape:completed', {
          totalInserted: result.totalInserted,
          totalFound: result.totalFound,
          durationMs: result.durationMs,
        });

        // Notify webhook subscribers (e.g. Antenne) about genuinely new missions.
        // Global event: every team subscribed to opportunity.new receives it.
        if (result.newOpportunities.length > 0) {
          const top = [...result.newOpportunities]
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 10);
          dispatchWebhookEvent({
            event: 'opportunity.new',
            data: {
              count: result.newOpportunities.length,
              missions: top.map((m) => ({
                id: m.id,
                title: m.title,
                company: m.company,
                source: m.source,
                budget: m.budget,
                relevanceScore: m.relevanceScore,
                url: m.url,
              })),
            },
          }).catch(() => {});
        }

        await job.updateProgress(100);
      } catch (err) {
        console.error('[OpportunityScraper] Fatal error:', err);
        events?.broadcast('opportunity:scrape:failed', {});
        throw err;
      }
    },
    options: {
      concurrency: 1,
    },
  };
}
