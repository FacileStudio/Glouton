import type { JobDefinition } from '../../types';
import type { Job as BullJob } from 'bullmq';
import type { EventEmitter } from '../index';
import { JobEventEmitter } from '../../lib/job-event-emitter';
import { SessionManager } from '../shared';
import { CsvImportProcessor } from './csv-import.processor';
import type { CsvImportData } from './csv-import.types';

export function createCsvImportWorker(events: EventEmitter): JobDefinition<CsvImportData, void> {
  const processor = new CsvImportProcessor();
  const sessionManager = new SessionManager();

  return {
    name: 'csv-import',
    processor: async (job: BullJob<CsvImportData>) => {
      const { huntSessionId, userId, teamId } = job.data;
      const scope = {
        type: teamId ? ('team' as const) : ('personal' as const),
        userId,
        teamId,
      };
      const emitter = new JobEventEmitter(events, scope);

      try {
        return await processor.process(job, emitter);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await sessionManager.failSession(huntSessionId, errorMessage);

        emitter.emit('hunt-failed', {
          huntSessionId,
          error: errorMessage,
          message: `CSV import failed: ${errorMessage}`,
        });

        throw error;
      }
    },
    options: {
      concurrency: 2,
      limiter: {
        max: 5,
        duration: 60000,
      },
    },
  };
}
