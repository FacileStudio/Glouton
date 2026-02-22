import { createLeadExtractionWorker } from './lead-extraction';
import { createLocalBusinessHuntWorker } from './local-business-hunt';
import { createLeadAuditWorker } from './lead-audit';
import { createDomainFinderWorker } from './domain-finder';
import { createCsvImportWorker } from './csv-import';

export interface EventEmitter {
  emit: (userId: string, type: string, data?: any) => void;
  broadcast: (type: string, data?: any) => void;
  emitToScope: (scope: { type: 'personal' | 'team'; userId: string; teamId?: string | null }, type: string, data?: any) => Promise<void>;
}

export function createWorkers(events: EventEmitter) {
  return {
    'lead-extraction': createLeadExtractionWorker(events),
    'local-business-hunt': createLocalBusinessHuntWorker(events),
    'lead-audit': createLeadAuditWorker(events),
    'domain-finder': createDomainFinderWorker(events),
    'csv-import': createCsvImportWorker(events),
  };
}

export const workers = {
  'lead-extraction': createLeadExtractionWorker,
  'local-business-hunt': createLocalBusinessHuntWorker,
  'lead-audit': createLeadAuditWorker,
  'domain-finder': createDomainFinderWorker,
  'csv-import': createCsvImportWorker,
};
