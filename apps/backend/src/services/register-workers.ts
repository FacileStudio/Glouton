import type { QueueManager } from '@repo/jobs';
import type { PrismaClient } from '@prisma/client';
import { createWorkers } from '@repo/jobs/workers';
import { events } from './events';
import { logger } from '@repo/logger';
import type { CourrierClient } from '@repo/courrier';
import { ardoise } from '@repo/trpc';
import env from '../env';

export function registerWorkers(
  queueManager: QueueManager,
  prisma: PrismaClient,
  courrier: CourrierClient | null = null
) {
  const workers = createWorkers(events, { courrier });

  Object.entries(workers).forEach(([name, worker]) => {
    queueManager.registerWorker(name, worker as any);
    logger.info(`[WORKERS] Registered ${name} worker`);
  });

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

