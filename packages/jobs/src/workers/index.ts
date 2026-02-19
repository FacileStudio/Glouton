import type { SQL } from 'bun';
import { createLeadExtractionWorker } from './lead-extraction.worker';
import { createLocalBusinessHuntWorker } from './local-business-hunt.worker';
import { createLeadAuditWorker } from './lead-audit.worker';
import { createDomainFinderWorker } from './domain-finder.worker';

export interface EventEmitter {
  emit: (userId: string, type: string, data?: any) => void;
  broadcast: (type: string, data?: any) => void;
}

export function createWorkers(db: SQL, events: EventEmitter) {
  return {
    'lead-extraction': createLeadExtractionWorker(db, events),
    'local-business-hunt': createLocalBusinessHuntWorker(db, events),
    'lead-audit': createLeadAuditWorker(db, events),
    'domain-finder': createDomainFinderWorker(db, events),
  };
}

export const workers = {
  'lead-extraction': createLeadExtractionWorker,
  'local-business-hunt': createLocalBusinessHuntWorker,
  'lead-audit': createLeadAuditWorker,
  'domain-finder': createDomainFinderWorker,
};
