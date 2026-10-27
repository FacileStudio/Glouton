import type { Job as BullJob } from 'bullmq';
import type { JobDefinition } from '../../types';
import type { EventEmitter } from '../index';
import { CompanyCreationProcessor } from './company-creation.processor';
import type { CompanyCreationData } from './company-creation.types';

export function createCompanyCreationWorker(
  events?: EventEmitter
): JobDefinition<CompanyCreationData, void> {
  const processor = new CompanyCreationProcessor();

  return {
    name: 'company-creation',
    processor: async (job: BullJob<CompanyCreationData>) => {
      console.log('[CompanyCreation] Starting scrape run...');
      try {
        const result = await processor.process((progress) => {
          events?.broadcast('company:creation:progress', progress);
          job.updateProgress(progress.percent).catch(() => {});
        }, job.data);

        console.log(`[CompanyCreation] Done: ${result.totalInserted} companies upserted in ${result.durationMs}ms`);
        events?.broadcast('company:creation:completed', {
          totalInserted: result.totalInserted,
          totalFound: result.totalFound,
          durationMs: result.durationMs,
        });

        await job.updateProgress(100);
      } catch (err) {
        console.error('[CompanyCreation] Fatal error:', err);
        events?.broadcast('company:creation:failed', {});
        throw err;
      }
    },
    options: {
      concurrency: 1,
    },
  };
}
