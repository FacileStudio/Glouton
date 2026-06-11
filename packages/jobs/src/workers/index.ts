import { createLocalBusinessHuntWorker } from './local-business-hunt';
import { createLeadAuditWorker } from './lead-audit';
import { createCsvImportWorker } from './csv-import';
import { createOpportunityScraperWorker } from './opportunity-scraper';

export interface EventEmitter {
  emit: (userId: string, type: string, data?: any) => void;
  broadcast: (type: string, data?: any) => void;
  emitToScope: (scope: { type: 'personal' | 'team'; userId: string; teamId?: string | null }, type: string, data?: any) => Promise<void>;
}

export function createWorkers(events: EventEmitter) {
  return {
    'local-business-hunt': createLocalBusinessHuntWorker(events),
    'lead-audit': createLeadAuditWorker(events),
    'csv-import': createCsvImportWorker(events),
    'opportunity-scraper': createOpportunityScraperWorker(),
  };
}

export const workers = {
  'local-business-hunt': createLocalBusinessHuntWorker,
  'lead-audit': createLeadAuditWorker,
  'csv-import': createCsvImportWorker,
};
