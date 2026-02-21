import type { JobDefinition } from '../../types';
import type { Job as BullJob } from 'bullmq';
import type { EventEmitter } from '../index';
import { JobEventEmitter } from '../../lib/job-event-emitter';
import { SessionManager } from '../shared';
import { DomainFinderProcessor } from './domain-finder.processor';
import type { DomainFinderData } from './domain-finder.types';

export type { DomainFinderData } from './domain-finder.types';

export function createDomainFinderWorker(events: EventEmitter): JobDefinition<DomainFinderData, void> {
  const processor = new DomainFinderProcessor();
  const sessionManager = new SessionManager();

  return {
    name: 'domain-finder',
    processor: async (job: BullJob<DomainFinderData>) => {
      const { huntSessionId, userId, teamId } = job.data;
      const scope = {
        type: teamId ? 'team' as const : 'personal' as const,
        userId,
        teamId,
      };
      const emitter = new JobEventEmitter(events, scope);

      try {
        await processor.process(job, emitter);
      } catch (error) {
        console.error(`[DomainFinder] Fatal error for session ${huntSessionId}:`, error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await sessionManager.failSession(huntSessionId, errorMessage);

        emitter.emit('hunt-failed', {
          huntSessionId,
          error: errorMessage,
          message: `Domain discovery failed: ${errorMessage}`,
        });

        throw error;
      }
    },
    options: {
      concurrency: 2,
      limiter: {
        max: 5,
        duration: 60000,
      },
    },
  };
}
