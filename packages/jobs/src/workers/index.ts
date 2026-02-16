import type { SQL } from 'bun';
import { createLeadExtractionWorker } from './lead-extraction.worker';
import { createLocalBusinessHuntWorker } from './local-business-hunt.worker';
import { createLeadAuditWorker } from './lead-audit.worker';

export function createWorkers(db: SQL) {
  return {
    'lead-extraction': createLeadExtractionWorker(db),
    'local-business-hunt': createLocalBusinessHuntWorker(db),
    'lead-audit': createLeadAuditWorker(db),
  };
}

// For backwards compatibility if needed
export const workers = {
  'lead-extraction': createLeadExtractionWorker,
  'local-business-hunt': createLocalBusinessHuntWorker,
  'lead-audit': createLeadAuditWorker,
};

