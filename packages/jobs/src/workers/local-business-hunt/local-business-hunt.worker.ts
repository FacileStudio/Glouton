import type { JobDefinition } from '../../types';
import type { Job as BullJob } from 'bullmq';
import { toMapsError } from '@repo/maps';
import { prisma } from '@repo/database';
import { dispatchWebhookEvent } from '@repo/webhooks';
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
        const result = await processor.process(job, emitter);

        // Webhooks are configured per workspace: only team hunts notify
        if (teamId) {
          const session = await prisma.huntSession.findUnique({
            where: { id: huntSessionId },
            select: { totalLeads: true, successfulLeads: true, failedLeads: true },
          });
          dispatchWebhookEvent({
            event: 'hunt.completed',
            teamId,
            data: {
              huntSessionId,
              location,
              category,
              totalLeads: session?.totalLeads ?? null,
              successfulLeads: session?.successfulLeads ?? null,
              failedLeads: session?.failedLeads ?? null,
            },
          }).catch(() => {});
        }

        return result;
      } catch (error) {
        console.error(`[LocalBusinessHunt] Fatal error:`, error);

        // Store and broadcast the clean user-facing message; the raw error
        // stays in the logs.
        const userMessage = toMapsError(error).userMessage;

        await sessionManager.failSession(huntSessionId, userMessage);

        emitter.emit('hunt-failed', {
          huntSessionId,
          error: userMessage,
          location,
          category,
          message: `Chasse échouée : ${userMessage}`,
        });

        if (teamId) {
          dispatchWebhookEvent({
            event: 'hunt.failed',
            teamId,
            data: { huntSessionId, location, category, error: userMessage },
          }).catch(() => {});
        }

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
