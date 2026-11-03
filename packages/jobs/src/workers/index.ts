import { createLocalBusinessHuntWorker } from './local-business-hunt';
import { createLeadAuditWorker } from './lead-audit';
import { createCsvImportWorker } from './csv-import';
import { createOpportunityScraperWorker } from './opportunity-scraper';
import { createCompanyCreationWorker } from './company-creation';
import type { CourrierClient } from '@repo/courrier';
import {
  createCourrierContactsImportWorker,
  createCourrierReplySyncWorker,
} from './courrier-sync';

export interface WorkerDependencies {
  courrier?: CourrierClient | null;
}

export interface EventEmitter {
  emit: (userId: string, type: string, data?: any) => void;
  broadcast: (type: string, data?: any) => void;
  emitToScope: (scope: { type: 'personal' | 'team'; userId: string; teamId?: string | null }, type: string, data?: any) => Promise<void>;
}

export function createWorkers(events: EventEmitter, deps: WorkerDependencies = {}) {
  return {
    'local-business-hunt': createLocalBusinessHuntWorker(events),
    'lead-audit': createLeadAuditWorker(events),
    'csv-import': createCsvImportWorker(events),
    'opportunity-scraper': createOpportunityScraperWorker(events),
    'company-creation': createCompanyCreationWorker(events),
    'courrier-reply-sync': createCourrierReplySyncWorker(deps.courrier ?? null),
    'courrier-contacts-import': createCourrierContactsImportWorker(deps.courrier ?? null, events),
  };
}

export const workers = {
  'local-business-hunt': createLocalBusinessHuntWorker,
  'lead-audit': createLeadAuditWorker,
  'csv-import': createCsvImportWorker,
  'opportunity-scraper': createOpportunityScraperWorker,
  'company-creation': createCompanyCreationWorker,
  'courrier-reply-sync': createCourrierReplySyncWorker,
  'courrier-contacts-import': createCourrierContactsImportWorker,
};

export { syncReplies, suggestImports, importContacts } from './courrier-sync';
