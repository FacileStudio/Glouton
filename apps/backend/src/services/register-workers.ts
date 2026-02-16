import type { QueueManager } from '@repo/jobs';
import type { SQL } from 'bun';
import { createWorkers } from '@repo/jobs/workers';
import { events } from './events';

export function registerWorkers(queueManager: QueueManager, db: SQL) {
  (global as any).events = events;

  const workers = createWorkers(db);

  Object.entries(workers).forEach(([name, worker]) => {
    queueManager.registerWorker('leads', worker);
    console.log(`[WORKERS] Registered ${name} worker`);
  });
}

