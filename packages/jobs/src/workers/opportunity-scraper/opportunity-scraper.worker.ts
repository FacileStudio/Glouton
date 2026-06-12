import type { Job as BullJob } from 'bullmq';
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
