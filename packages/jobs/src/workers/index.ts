import type { SQL } from 'bun';
import { createLeadExtractionWorker } from './lead-extraction.worker';
import { createLocalBusinessHuntWorker } from './local-business-hunt.worker';
import { createLeadAuditWorker } from './lead-audit.worker';

export interface EventEmitter {
  emit: (userId: string, type: string, data?: any) => void;
  broadcast: (type: string, data?: any) => void;
}

export function createWorkers(db: SQL, events: EventEmitter) {
  return {
    'lead-extraction': createLeadExtractionWorker(db),
    'local-business-hunt': createLocalBusinessHuntWorker(db, events),
    'lead-audit': createLeadAuditWorker(db, events),
  };
}

// For backwards compatibility if needed
export const workers = {
  'lead-extraction': createLeadExtractionWorker,
  'local-business-hunt': createLocalBusinessHuntWorker,
  'lead-audit': createLeadAuditWorker,
};

