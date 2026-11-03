import type { QueueManager } from '@repo/jobs';
import type { PrismaClient } from '@prisma/client';
import { createWorkers } from '@repo/jobs/workers';
import { events } from './events';
import { logger } from '@repo/logger';
import type { CourrierClient } from '@repo/courrier';

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
}

