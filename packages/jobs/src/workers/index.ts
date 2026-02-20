import { createLeadExtractionWorker } from './lead-extraction.worker';
import { createLocalBusinessHuntWorker } from './local-business-hunt.worker';
import { createLeadAuditWorker } from './lead-audit.worker';
import { createDomainFinderWorker } from './domain-finder.worker';

export interface EventEmitter {
  emit: (userId: string, type: string, data?: any) => void;
  broadcast: (type: string, data?: any) => void;
}

export function createWorkers(events: EventEmitter) {
  return {
    'lead-extraction': createLeadExtractionWorker(events),
    'local-business-hunt': createLocalBusinessHuntWorker(events),
    'lead-audit': createLeadAuditWorker(events),
    'domain-finder': createDomainFinderWorker(events),
  };
}

export const workers = {
  'lead-extraction': createLeadExtractionWorker,
  'local-business-hunt': createLocalBusinessHuntWorker,
  'lead-audit': createLeadAuditWorker,
  'domain-finder': createDomainFinderWorker,
};
