import type { JobDefinition } from '../../types';
import type { Job as BullJob } from 'bullmq';
import type { EventEmitter } from '../index';
import { JobEventEmitter } from '../../lib/job-event-emitter';
import { SessionManager } from '../shared';
import { LeadExtractionProcessor } from './lead-extraction.processor';
import type { LeadExtractionData } from './lead-extraction.types';

export type { LeadExtractionData } from './lead-extraction.types';

export function createLeadExtractionWorker(events: EventEmitter): JobDefinition<LeadExtractionData, void> {
  const processor = new LeadExtractionProcessor();
  const sessionManager = new SessionManager();

  return {
    name: 'lead-extraction',
    processor: async (job: BullJob<LeadExtractionData>) => {
      const { huntSessionId, userId } = job.data;
      const emitter = new JobEventEmitter(events, userId);

      try {
        await processor.process(job, emitter);
      } catch (error) {
        console.error(`[LeadExtraction] Fatal error for session ${huntSessionId}:`, error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await sessionManager.failSession(huntSessionId, errorMessage);

        emitter.emit('extraction-failed', {
          huntSessionId,
          error: errorMessage,
          message: 'Lead extraction failed due to an error',
        });

        throw error;
      }
    },
    options: {
      concurrency: 3,
      limiter: {
        max: 5,
        duration: 60000,
      },
    },
  };
}
