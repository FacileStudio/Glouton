import type { Job } from 'bullmq';
import type { JobEventEmitter } from '../../lib/job-event-emitter';

export class ProgressTracker {
  async updateProgress(
    job: Job,
    emitter: JobEventEmitter,
    sessionId: string,
    current: number,
    total: number,
    additionalData?: Record<string, any>
  ): Promise<void> {
    const progress = Math.floor((current / total) * 100);
    await job.updateProgress(progress);

    emitter.emit('hunt-progress', {
      huntSessionId: sessionId,
      progress,
      processedLeads: current,
      totalLeads: total,
      status: 'PROCESSING',
      ...additionalData,
    });
  }

  async updateAuditProgress(
    job: Job,
    emitter: JobEventEmitter,
    sessionId: string,
    stats: {
      processedCount: number;
      totalCount: number;
      updatedLeads: number;
      failedLeads: number;
    }
  ): Promise<void> {
    const progress = Math.floor((stats.processedCount / stats.totalCount) * 100);
    await job.updateProgress(progress);

    emitter.emit('audit-progress', {
      auditSessionId: sessionId,
      progress,
      processedLeads: stats.processedCount,
      updatedLeads: stats.updatedLeads,
      failedLeads: stats.failedLeads,
      totalLeads: stats.totalCount,
    });
  }

  calculateProgress(current: number, total: number, minProgress = 0, maxProgress = 100): number {
    const range = maxProgress - minProgress;
    return Math.floor(minProgress + (current / total) * range);
  }
}
