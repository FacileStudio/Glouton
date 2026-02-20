import { createLeadExtractionWorker } from './lead-extraction';
import { createLocalBusinessHuntWorker } from './local-business-hunt';
import { createLeadAuditWorker } from './lead-audit';
import { createDomainFinderWorker } from './domain-finder';

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
