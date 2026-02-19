import type { QueueManager } from '@repo/jobs';
import type { SQL } from 'bun';
import { createWorkers } from '@repo/jobs/workers';
import { events } from './events';
import { logger } from '@repo/logger';

export function registerWorkers(queueManager: QueueManager, db: SQL) {
  const workers = createWorkers(db, events);

  Object.entries(workers).forEach(([name, worker]) => {
    queueManager.registerWorker(name, worker);
    logger.info(`[WORKERS] Registered ${name} worker`);
  });
}

