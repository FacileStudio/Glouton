import type { JobDefinition, QueueManager, ScopeGate } from '@repo/jobs';
import type { PrismaClient } from '@prisma/client';
import { createWorkers } from '@repo/jobs/workers';
import { events } from './events';
import { logger } from '@repo/logger';
import type { CourrierClient } from '@repo/courrier';
import { ardoise, forfait } from '@repo/trpc';
import env from '../env';

type ScopedJob = { userId?: unknown; teamId?: unknown };

/**
 * Wraps a worker whose jobs belong to one scope (`userId` + `teamId` in the
 * job data) so a job of a scope without a Glouton plan is skipped and logged
 * instead of run. The job completes, so BullMQ does not retry it, and no data
 * is touched.
 */
export function scopeGuarded<T extends ScopedJob, R>(
  definition: JobDefinition<T, R>,
  allowed: ScopeGate
): JobDefinition<T, R | undefined> {
  return {
    ...definition,
    processor: async (job) => {
      const userId = typeof job.data.userId === 'string' ? job.data.userId : null;
      const teamId = typeof job.data.teamId === 'string' && job.data.teamId ? job.data.teamId : null;
      if (!userId || !(await allowed({ userId, teamId }))) {
        logger.info({ job: definition.name, jobId: job.id, userId, teamId }, '[FORFAIT] Job skipped: its scope has no Glouton plan');
        return undefined;
      }
      return definition.processor(job);
    },
  };
}

export function registerWorkers(
  queueManager: QueueManager,
  prisma: PrismaClient,
  courrier: CourrierClient | null = null
) {
  const allowed = forfait.jobGate(forfait.dbForfait(prisma, env.OIDC_ISSUER));
  const workers = createWorkers(events, { courrier, allowed });

  queueManager.registerWorker('local-business-hunt', scopeGuarded(workers['local-business-hunt'], allowed));
  queueManager.registerWorker('lead-audit', scopeGuarded(workers['lead-audit'], allowed));
  queueManager.registerWorker('csv-import', scopeGuarded(workers['csv-import'], allowed));
  queueManager.registerWorker('opportunity-scraper', workers['opportunity-scraper']);
  queueManager.registerWorker('company-creation', workers['company-creation']);
  queueManager.registerWorker('courrier-reply-sync', workers['courrier-reply-sync']);
  queueManager.registerWorker('courrier-contacts-import', workers['courrier-contacts-import']);
  logger.info(`[WORKERS] Registered ${Object.keys(workers).join(', ')} workers`);

  const sync = ardoise.ardoiseDeps(prisma, env, queueManager, logger);
  if (!sync.config) return;
  queueManager.registerWorker<{ companyId: string }>(ardoise.ARDOISE_QUEUE, {
    name: 'push',
    processor: (job) => ardoise.pushCompany(sync, job.data.companyId),
    options: { concurrency: 2 },
  });
  queueManager.registerWorker<{ ardoiseClientId: string }>(ardoise.ARDOISE_QUEUE, {
    name: 'unlink',
    processor: (job) => ardoise.unlinkRemote(sync, job.data.ardoiseClientId),
  });
  logger.info(`[WORKERS] Registered ${ardoise.ARDOISE_QUEUE} worker`);
}

