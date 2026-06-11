import type { Job as BullJob } from 'bullmq';
import type { JobDefinition } from '../../types';
import { OpportunityScraperProcessor } from './opportunity-scraper.processor';
import type { OpportunityScraperData } from './opportunity-scraper.types';

export function createOpportunityScraperWorker(): JobDefinition<OpportunityScraperData, void> {
  const processor = new OpportunityScraperProcessor();

  return {
    name: 'opportunity-scraper',
    processor: async (job: BullJob<OpportunityScraperData>) => {
      console.log('[OpportunityScraper] Starting scrape run...');
      try {
        const result = await processor.process();
        console.log(`[OpportunityScraper] Done: ${result.totalInserted} new opportunities in ${result.durationMs}ms`);
        await job.updateProgress(100);
      } catch (err) {
        console.error('[OpportunityScraper] Fatal error:', err);
        throw err;
      }
    },
    options: {
      concurrency: 1,
    },
  };
}
