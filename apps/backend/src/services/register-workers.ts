import type { JobDefinition, QueueManager, ScopeGate } from '@repo/jobs';
import type { PrismaClient } from '@prisma/client';
import { createWorkers, redisWebSearch } from '@repo/jobs/workers';
import { events } from './events';
import { logger } from '@repo/logger';
import type { CourrierClient } from '@repo/courrier';
import { ardoise, forfait } from '@repo/trpc';
import env from '../env';

type ScopedJob = { userId?: unknown; teamId?: unknown; huntSessionId?: unknown; auditSessionId?: unknown };

/** The reason stored on a hunt or audit session a worker skipped. */
export const SKIPPED_REASON = 'Skipped: this space has no Glouton plan';

/**
 * Marks the hunt or audit session behind a skipped job as cancelled with
 * the skip reason, so it does not sit pending forever. Only sessions still
 * pending or processing are touched.
 */
export function markSkipped(prisma: PrismaClient) {
  return async (data: ScopedJob): Promise<void> => {
    const open = { in: ['PENDING', 'PROCESSING'] as ('PENDING' | 'PROCESSING')[] };
    const done = { status: 'CANCELLED' as const, error: SKIPPED_REASON, completedAt: new Date() };
    if (typeof data.huntSessionId === 'string') {
      await prisma.huntSession.updateMany({ where: { id: data.huntSessionId, status: open }, data: done });
    }
    if (typeof data.auditSessionId === 'string') {
      await prisma.auditSession.updateMany({ where: { id: data.auditSessionId, status: open }, data: done });
    }
  };
}

/**
 * Wraps a worker whose jobs belong to one scope (`userId` + `teamId` in the
 * job data) so a job of a scope without a Glouton plan is skipped and logged
 * instead of run. The job completes, so BullMQ does not retry it, and no data
 * is touched.
 */
export function scopeGuarded<T extends ScopedJob, R>(
  definition: JobDefinition<T, R>,
  allowed: ScopeGate,
  onSkip: (data: T) => Promise<void> = async () => {}
): JobDefinition<T, R | undefined> {
  return {
    ...definition,
    processor: async (job) => {
      const userId = typeof job.data.userId === 'string' ? job.data.userId : null;
      const teamId = typeof job.data.teamId === 'string' && job.data.teamId ? job.data.teamId : null;
      if (!userId || !(await allowed({ userId, teamId }))) {
        logger.info({ job: definition.name, jobId: job.id, userId, teamId }, '[FORFAIT] Job skipped: its scope has no Glouton plan');
        await onSkip(job.data).catch((error: unknown) =>
          logger.error({ err: error, jobId: job.id }, '[FORFAIT] Could not mark the skipped session')
        );
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
  const websearch = redisWebSearch({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
    maxRetriesPerRequest: null,
  });
  const workers = createWorkers(events, { courrier, allowed, websearch });

  const skipped = markSkipped(prisma);
  queueManager.registerWorker('local-business-hunt', scopeGuarded(workers['local-business-hunt'], allowed, skipped));
  queueManager.registerWorker('lead-audit', scopeGuarded(workers['lead-audit'], allowed, skipped));
  queueManager.registerWorker('csv-import', scopeGuarded(workers['csv-import'], allowed, skipped));
  queueManager.registerWorker('opportunity-scraper', workers['opportunity-scraper']);
  queueManager.registerWorker('company-creation', workers['company-creation']);
  queueManager.registerWorker('courrier-reply-sync', workers['courrier-reply-sync']);
  queueManager.registerWorker('courrier-contacts-import', workers['courrier-contacts-import']);
  queueManager.registerWorker('competitor-watch', workers['competitor-watch']);
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

