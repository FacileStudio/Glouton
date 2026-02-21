import type { JobDefinition } from '../../types';
import type { Job as BullJob } from 'bullmq';
import type { EventEmitter } from '../index';
import { JobEventEmitter } from '../../lib/job-event-emitter';
import { SessionManager } from '../shared';
import { LocalBusinessHuntProcessor } from './local-business-hunt.processor';
import type { LocalBusinessHuntData } from './local-business-hunt.types';

export type { LocalBusinessHuntData } from './local-business-hunt.types';

export function createLocalBusinessHuntWorker(events: EventEmitter): JobDefinition<LocalBusinessHuntData, void> {
  const processor = new LocalBusinessHuntProcessor();
  const sessionManager = new SessionManager();

  return {
    name: 'local-business-hunt',
    processor: async (job: BullJob<LocalBusinessHuntData>) => {
      const { huntSessionId, location, category, userId, teamId } = job.data;
      const scope = {
        type: teamId ? 'team' as const : 'personal' as const,
        userId,
        teamId,
      };
      const emitter = new JobEventEmitter(events, scope);

      try {
        return await processor.process(job, emitter);
      } catch (error) {
        console.error(`[LocalBusinessHunt] Fatal error:`, error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await sessionManager.failSession(huntSessionId, errorMessage);

        emitter.emit('hunt-failed', {
          huntSessionId,
          error: errorMessage,
          location,
          category,
          message: `Hunt failed: ${errorMessage}`,
        });

        throw error;
      }
    },
    options: {
      concurrency: 1,
      limiter: {
        max: 5,
        duration: 60000,
      },
    },
  };
}
