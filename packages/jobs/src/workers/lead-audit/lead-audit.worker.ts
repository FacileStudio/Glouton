import type { Job } from 'bullmq';
import type { EventEmitter } from '../index';
import { JobEventEmitter } from '../../lib/job-event-emitter';
import { SessionManager } from '../shared';
import { LeadAuditProcessor } from './lead-audit.processor';
import type { LeadAuditJobData } from './lead-audit.types';

export type { LeadAuditJobData } from './lead-audit.types';

export function createLeadAuditWorker(events: EventEmitter) {
  const processor = new LeadAuditProcessor();
  const sessionManager = new SessionManager();

  return {
    name: 'lead-audit',
    processor: async (job: Job<LeadAuditJobData>) => {
      const { auditSessionId, userId, teamId } = job.data;
      const scope = {
        type: teamId ? 'team' as const : 'personal' as const,
        userId,
        teamId,
      };
      const emitter = new JobEventEmitter(events, scope);

      try {
        return await processor.process(job, emitter);
      } catch (fatalError: any) {
        console.error('[LeadAudit] Fatal Error:', fatalError);

        await sessionManager.failAuditSession(auditSessionId, fatalError.message);

        throw fatalError;
      }
    },
    options: { concurrency: 5 },
  };
}
