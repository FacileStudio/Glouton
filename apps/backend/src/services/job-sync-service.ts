import type { SQL } from 'bun';
import type { QueueManager } from '@repo/jobs';
import { logger } from '@repo/logger';

export class JobSyncService {
  constructor(
    private db: SQL,
    private jobs: QueueManager
  ) {}

  async syncJobStates(): Promise<void> {
    try {
      logger.debug('[JOBS] Syncing database states with BullMQ');

      const [auditSessions, huntSessions, orphanedAuditSessions, orphanedHuntSessions] =
        await Promise.all([
          this.getActiveAuditSessions(),
          this.getActiveHuntSessions(),
          this.getOrphanedAuditSessions(),
          this.getOrphanedHuntSessions(),
        ]);

      const auditStats = await this.syncAuditSessions(auditSessions, orphanedAuditSessions);
      const huntStats = await this.syncHuntSessions(huntSessions, orphanedHuntSessions);

      logger.info({
        syncedAudits: auditStats.synced,
        syncedHunts: huntStats.synced,
        stalledAudits: auditStats.stalled,
        stalledHunts: huntStats.stalled,
      }, '[JOBS] Job state sync completed');
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
        '[JOBS] Failed to sync job states'
      );
    }
  }

  private async getActiveAuditSessions() {
    return this.db`
      SELECT id, "jobId", status, "userId"
      FROM "AuditSession"
      WHERE status IN ('PENDING', 'PROCESSING') AND "jobId" IS NOT NULL
    ` as Promise<any[]>;
  }

  private async getActiveHuntSessions() {
    return this.db`
      SELECT id, "jobId", status, "userId"
      FROM "HuntSession"
      WHERE status IN ('PENDING', 'PROCESSING') AND "jobId" IS NOT NULL
    ` as Promise<any[]>;
  }

  private async getOrphanedAuditSessions() {
    return this.db`
      SELECT id, status, "createdAt"
      FROM "AuditSession"
      WHERE status IN ('PENDING', 'PROCESSING')
        AND "jobId" IS NULL
        AND "createdAt" < ${new Date(Date.now() - 5 * 60 * 1000)}
    ` as Promise<any[]>;
  }

  private async getOrphanedHuntSessions() {
    return this.db`
      SELECT id, status, "createdAt", "userId"
      FROM "HuntSession"
      WHERE status IN ('PENDING', 'PROCESSING')
        AND "jobId" IS NULL
        AND "createdAt" < ${new Date(Date.now() - 5 * 60 * 1000)}
    ` as Promise<any[]>;
  }

  private async syncAuditSessions(
    activeSessions: Array<{ id: string; jobId: string | null; status: string; userId: string }>,
    orphanedSessions: Array<{ id: string; status: string; createdAt: Date }>
  ): Promise<{ synced: number; stalled: number }> {
    let synced = 0;
    let stalled = 0;

    for (const session of activeSessions) {
      if (!session.jobId) continue;

      const job = await this.jobs.getJob('leads', session.jobId);
      if (!job) {
        logger.debug(`[AUDIT] Job ${session.jobId} not found, marking session as failed`);
        const [updated] = await this.db`
          UPDATE "AuditSession"
          SET status = 'FAILED',
              error = 'Job not found in queue (worker may have crashed)',
              "completedAt" = ${new Date()}
          WHERE id = ${session.id}
          RETURNING "userId"
        `;

        if (globalThis.broadcastToUser && updated.userId) {
          globalThis.broadcastToUser(updated.userId, {
            type: 'audit-failed',
            data: {
              auditSessionId: session.id,
              status: 'FAILED',
              error: 'Job not found in queue (worker may have crashed)',
            },
          });
        }

        synced++;
        continue;
      }

      const jobState = await job.getState();

      if (jobState === 'completed') {
        logger.debug(`[AUDIT] Job ${session.jobId} completed but session still processing, marking as completed`);
        await this.db`
          UPDATE "AuditSession"
          SET status = 'COMPLETED',
              "completedAt" = ${new Date()}
          WHERE id = ${session.id}
        `;
        synced++;
      } else if (jobState === 'failed') {
        logger.debug(`[AUDIT] Job ${session.jobId} failed, marking session as failed`);
        await this.db`
          UPDATE "AuditSession"
          SET status = 'FAILED',
              error = ${job.failedReason || 'Job failed'},
              "completedAt" = ${new Date()}
          WHERE id = ${session.id}
        `;
        synced++;
      } else if (jobState === 'active') {
        logger.info({
          sessionId: session.id,
          jobId: session.jobId,
        }, '[AUDIT] Job was active during restart, retrying...');
        try {
          await job.moveToFailed(new Error('Server restart - job interrupted'), '0');
          const failedJob = await this.jobs.getJob('leads', session.jobId);
          if (failedJob) {
            await failedJob.retry();
            logger.info(`[AUDIT] Successfully retried job ${session.jobId} after restart`);
          }
          synced++;
        } catch (error) {
          logger.error({
            sessionId: session.id,
            jobId: session.jobId,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, '[AUDIT] Failed to retry job after restart');
        }
      }
    }

    for (const session of orphanedSessions) {
      logger.warn({
        sessionId: session.id,
        createdAt: session.createdAt,
      }, '[AUDIT] Found orphaned session without jobId, marking as failed');
      await this.db`
        UPDATE "AuditSession"
        SET status = 'FAILED',
            error = 'No job ID found - session orphaned',
            "completedAt" = ${new Date()}
        WHERE id = ${session.id}
      `;
      stalled++;
    }

    return { synced, stalled };
  }

  private async syncHuntSessions(
    activeSessions: Array<{ id: string; jobId: string | null; status: string; userId: string }>,
    orphanedSessions: Array<{ id: string; status: string; createdAt: Date; userId: string }>
  ): Promise<{ synced: number; stalled: number }> {
    let synced = 0;
    let stalled = 0;

    for (const session of activeSessions) {
      if (!session.jobId) continue;

      const job = await this.jobs.getJob('leads', session.jobId);
      if (!job) {
        logger.debug(`[HUNT] Job ${session.jobId} not found, marking session as failed`);
        await this.db`
          UPDATE "HuntSession"
          SET status = 'FAILED',
              error = 'Job not found in queue (worker may have crashed)',
              "completedAt" = ${new Date()}
          WHERE id = ${session.id}
        `;

        if (globalThis.broadcastToUser && session.userId) {
          globalThis.broadcastToUser(session.userId, {
            type: 'hunt-update',
            data: {
              huntSessionId: session.id,
              status: 'FAILED',
              error: 'Job not found in queue (worker may have crashed)',
            },
          });
        }

        synced++;
        continue;
      }

      const jobState = await job.getState();
      if (jobState === 'completed') {
        logger.debug(`[HUNT] Job ${session.jobId} completed but session still processing, marking as completed`);
        await this.db`
          UPDATE "HuntSession"
          SET status = 'COMPLETED',
              "completedAt" = ${new Date()}
          WHERE id = ${session.id}
        `;
        synced++;
      } else if (jobState === 'failed') {
        logger.debug(`[HUNT] Job ${session.jobId} failed, marking session as failed`);
        await this.db`
          UPDATE "HuntSession"
          SET status = 'FAILED',
              error = ${job.failedReason || 'Job failed'},
              "completedAt" = ${new Date()}
          WHERE id = ${session.id}
        `;
        synced++;
      } else if (jobState === 'active') {
        logger.info({
          sessionId: session.id,
          jobId: session.jobId,
        }, '[HUNT] Job was active during restart, retrying...');
        try {
          await job.moveToFailed(new Error('Server restart - job interrupted'), '0');
          const failedJob = await this.jobs.getJob('leads', session.jobId);
          if (failedJob) {
            await failedJob.retry();
            logger.info(`[HUNT] Successfully retried job ${session.jobId} after restart`);
          }
          synced++;
        } catch (error) {
          logger.error({
            sessionId: session.id,
            jobId: session.jobId,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, '[HUNT] Failed to retry job after restart');
        }
      }
    }

    for (const session of orphanedSessions) {
      logger.warn({
        sessionId: session.id,
        userId: session.userId,
        createdAt: session.createdAt,
      }, '[HUNT] Found orphaned session without jobId, marking as failed');
      await this.db`
        UPDATE "HuntSession"
        SET status = 'FAILED',
            error = 'No job ID found - session orphaned',
            "completedAt" = ${new Date()}
        WHERE id = ${session.id}
      `;
      stalled++;
    }

    return { synced, stalled };
  }
}
