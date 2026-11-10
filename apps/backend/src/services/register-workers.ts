import type { JobDefinition, QueueManager, ScopeGate } from '@repo/jobs';
import type { PrismaClient } from '@prisma/client';
import { JOB_BOARDS, createWorkers, osmPlaces, redisWebSearch } from '@repo/jobs/workers';
import { events } from './events';
import { logger } from '@repo/logger';
import type { CourrierClient } from '@repo/courrier';
import { ardoise, competitorAi, discovery, forfait, jobSearch, schedules, type BulleClient } from '@repo/trpc';
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

/**
 * Wraps the hunt worker so a scheduled run is settled on its schedule as
 * soon as its job ends: succeeded, skipped, or failed on its last attempt
 * (an attempt BullMQ will retry leaves the run open).
 * Settling is idempotent and a no-op while the session is still pending or
 * processing; the 15-minute tick catches any run this misses.
 */
export function settledAfter<T extends ScopedJob, R>(
  definition: JobDefinition<T, R>,
  settle: (huntSessionId: string) => Promise<unknown>
): JobDefinition<T, R> {
  const after = async (data: T) => {
    if (typeof data.huntSessionId !== 'string') return;
    await settle(data.huntSessionId).catch((error: unknown) =>
      logger.error({ err: error, huntSessionId: data.huntSessionId }, '[SCHEDULES] Could not settle a scheduled run')
    );
  };
  return {
    ...definition,
    processor: async (job) => {
      let final = true;
      try {
        return await definition.processor(job);
      } catch (error) {
        final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        throw error;
      } finally {
        if (final) await after(job.data);
      }
    },
  };
}

/**
 * Wraps a worker so `after` runs once its job succeeded. A failure in
 * `after` is logged and never fails the job.
 */
export function thenRun<T, R>(definition: JobDefinition<T, R>, label: string, after: () => Promise<unknown>): JobDefinition<T, R> {
  return {
    ...definition,
    processor: async (job) => {
      const result = await definition.processor(job);
      await after().catch((error: unknown) => logger.error({ err: error }, `[${label}] Follow-up failed`));
      return result;
    },
  };
}

/** The discovery worker: one run for the job's scope, recorded as failed when it throws. */
export function discoveryWorker(deps: discovery.DiscoveryDeps): JobDefinition<discovery.DiscoveryJob, discovery.DiscoveryResult> {
  return {
    name: discovery.DISCOVERY_QUEUE,
    processor: async (job) => {
      const scope = discovery.scopeOfRow({ userId: job.data.userId, teamId: job.data.teamId ?? null });
      try {
        const result = await discovery.runDiscovery(deps, scope);
        logger.info({ ...result, userId: job.data.userId, teamId: job.data.teamId, trigger: job.data.trigger }, '[DISCOVERY] Run finished');
        return result;
      } catch (error) {
        await discovery.failDiscovery(deps.prisma, scope, error).catch(() => {});
        throw error;
      }
    },
    options: { concurrency: 1 },
  };
}

/** The job search worker: one run of one search, recorded as failed when it throws. */
export function jobSearchWorker(deps: jobSearch.JobSearchDeps): JobDefinition<jobSearch.JobSearchJob, jobSearch.JobSearchResult> {
  return {
    name: jobSearch.JOB_SEARCH_QUEUE,
    processor: async (job) => {
      try {
        const result = await jobSearch.runSearch(deps, { ...job.data, teamId: job.data.teamId ?? null });
        logger.info({ ...result, searchId: job.data.searchId, trigger: job.data.trigger }, '[JOB_SEARCH] Run finished');
        return result;
      } catch (error) {
        await jobSearch.failSearch(deps.prisma, job.data.searchId, error).catch(() => {});
        throw error;
      }
    },
    options: { concurrency: 1 },
  };
}

/**
 * The job search part of the hunt-schedules tick: recurring searches whose
 * slot came, then application reminders that came due, each sent once to
 * the application's owner.
 */
export async function jobTick(deps: jobSearch.TickDeps, notify: (userId: string, data: Record<string, unknown>) => void) {
  const searches = await jobSearch.tick(deps);
  const reminders = await jobSearch.claimReminders(deps.prisma, deps.now?.() ?? new Date());
  for (const reminder of reminders) notify(reminder.userId, { ...reminder });
  return { ...searches, reminders: reminders.length };
}

export function registerWorkers(
  queueManager: QueueManager,
  prisma: PrismaClient,
  courrier: CourrierClient | null = null,
  bulle: BulleClient | null = null
) {
  const reader = forfait.dbForfait(prisma, env.OIDC_ISSUER);
  const allowed = forfait.jobGate(reader);
  const websearch = redisWebSearch({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
    maxRetriesPerRequest: null,
  });
  const summarize = competitorAi.digestSummarizer({ prisma, bulle, forfait: reader });
  const workers = createWorkers(events, { courrier, allowed, websearch, summarize });

  const skipped = markSkipped(prisma);
  const notify = (scope: { type: 'personal' | 'team'; userId: string; teamId?: string | null }, type: string, data: Record<string, unknown>) =>
    events.emitToScope(scope, type, data);
  const runner: schedules.RunnerDeps = {
    prisma,
    jobs: queueManager,
    allowed,
    notify,
  };
  queueManager.registerWorker(
    'local-business-hunt',
    settledAfter(scopeGuarded(workers['local-business-hunt'], allowed, skipped), (id) => schedules.settleSession(runner, id))
  );
  queueManager.registerWorker('lead-audit', scopeGuarded(workers['lead-audit'], allowed, skipped));
  queueManager.registerWorker('csv-import', scopeGuarded(workers['csv-import'], allowed, skipped));
  queueManager.registerWorker('opportunity-scraper', workers['opportunity-scraper']);
  const discoveryDeps: discovery.DiscoveryDeps = { prisma, web: websearch, places: osmPlaces(), notify, allowed };
  queueManager.registerWorker(
    'company-creation',
    thenRun(workers['company-creation'], 'BODACC', async () => {
      const result = await discovery.watchRegistrations(discoveryDeps);
      if (result.created > 0) logger.info(result, '[BODACC] New registered competitors');
    })
  );
  queueManager.registerWorker(discovery.DISCOVERY_QUEUE, scopeGuarded(discoveryWorker(discoveryDeps), allowed));
  queueManager.registerWorker(discovery.DISCOVERY_TICK_QUEUE, {
    name: discovery.DISCOVERY_TICK_QUEUE,
    processor: async () => {
      const result = await discovery.tick({ prisma, jobs: queueManager, allowed });
      if (result.queued > 0) logger.info(result, '[DISCOVERY] Weekly runs queued');
      return result;
    },
    options: { concurrency: 1 },
  });
  queueManager.registerWorker('courrier-reply-sync', workers['courrier-reply-sync']);
  queueManager.registerWorker('courrier-contacts-import', workers['courrier-contacts-import']);
  queueManager.registerWorker('competitor-watch', workers['competitor-watch']);
  const jobDeps: jobSearch.JobSearchDeps = { prisma, boards: JOB_BOARDS, web: websearch, notify };
  queueManager.registerWorker(jobSearch.JOB_SEARCH_QUEUE, scopeGuarded(jobSearchWorker(jobDeps), allowed));
  queueManager.registerWorker(schedules.SCHEDULE_QUEUE, {
    name: schedules.SCHEDULE_QUEUE,
    processor: async () => {
      const result = await schedules.tick(runner);
      if (result.started + result.settled + result.failed > 0) logger.info(result, '[SCHEDULES] Tick');
      const jobs = await jobTick({ prisma, jobs: queueManager, allowed }, (userId, data) => events.emit(userId, jobSearch.REMINDER_EVENT, data)).catch(
        (error: unknown) => {
          logger.error({ err: error }, '[JOB_SEARCH] Tick failed');
          return null;
        }
      );
      if (jobs && jobs.queued + jobs.skipped + jobs.reminders > 0) logger.info(jobs, '[JOB_SEARCH] Tick');
      return result;
    },
    options: { concurrency: 1 },
  });
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

