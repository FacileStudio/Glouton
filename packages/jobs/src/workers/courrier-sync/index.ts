import { prisma } from '@repo/database';
import type { CourrierClient } from '@repo/courrier';
import { logger } from '@repo/logger';
import { allowEveryScope, type JobDefinition, type ScopeGate } from '../../types';
import type { EventEmitter } from '../index';
import { importContacts } from './contacts-import';
import { syncReplies } from './reply-sync';

export { syncReplies, REPLY_WINDOW_DAYS, type ReplySource, type ReplySyncResult } from './reply-sync';
export { importContacts, suggestImports, MAX_SUGGESTIONS_PER_RUN, type ContactSource } from './contacts-import';

export const COURRIER_REPLY_SYNC = 'courrier-reply-sync';
export const COURRIER_CONTACTS_IMPORT = 'courrier-contacts-import';

/** Every 15 minutes: marks Courrier outreach as replied. Inert without a Courrier client. */
export function createCourrierReplySyncWorker(
  courrier: CourrierClient | null,
  allowed: ScopeGate = allowEveryScope
): JobDefinition<object, void> {
  return {
    name: COURRIER_REPLY_SYNC,
    processor: async () => {
      if (!courrier) return;
      try {
        const result = await syncReplies(prisma, courrier, new Date(), allowed);
        logger.info(result, '[COURRIER] Reply sync done');
      } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, '[COURRIER] Reply sync failed');
      }
    },
    options: { concurrency: 1 },
  };
}

/** Daily: proposes unknown Courrier contacts as IMPORT suggestions. Inert without a Courrier client. */
export function createCourrierContactsImportWorker(
  courrier: CourrierClient | null,
  events?: EventEmitter,
  allowed: ScopeGate = allowEveryScope
): JobDefinition<object, void> {
  return {
    name: COURRIER_CONTACTS_IMPORT,
    processor: async () => {
      if (!courrier) return;
      try {
        const { suggestedByUser, ...summary } = await importContacts(prisma, courrier, allowed);
        logger.info(summary, '[COURRIER] Contact import done');
        for (const [userId, count] of suggestedByUser) {
          events?.emit(userId, 'suggestion:new', { kind: 'IMPORT', count });
        }
      } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, '[COURRIER] Contact import failed');
      }
    },
    options: { concurrency: 1 },
  };
}
