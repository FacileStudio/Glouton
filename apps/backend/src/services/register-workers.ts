import type { QueueManager } from '@repo/jobs';
import type { PrismaClient } from '@prisma/client';
import { createWorkers } from '@repo/jobs/workers';
import { events } from './events';
import { logger } from '@repo/logger';

export function registerWorkers(queueManager: QueueManager, prisma: PrismaClient) {
  const workers = createWorkers(prisma, events);

  Object.entries(workers).forEach(([name, worker]) => {
    queueManager.registerWorker(name, worker);
    logger.info(`[WORKERS] Registered ${name} worker`);
  });
}

