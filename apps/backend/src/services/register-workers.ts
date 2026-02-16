import type { QueueManager } from '@repo/jobs';
import type { SQL } from 'bun';
import { createWorkers } from '@repo/jobs/workers';
import { events } from './events';

export function registerWorkers(queueManager: QueueManager, db: SQL) {
  // Make events available globally for workers
  (global as any).events = events;

  // Create workers with database connection
  const workers = createWorkers(db);

  // Register all lead-related workers
  Object.entries(workers).forEach(([name, worker]) => {
    queueManager.registerWorker('leads', worker);
    console.log(`[WORKERS] Registered ${name} worker`);
  });
}