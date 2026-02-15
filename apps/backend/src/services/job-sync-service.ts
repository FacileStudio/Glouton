import type { PrismaClient } from '@repo/database';
import type { QueueManager } from '@repo/jobs';
import { logger } from '@repo/logger';

export class JobSyncService {
  /**
   * constructor
   */
  constructor(
    private db: PrismaClient,
    private jobs: QueueManager
  ) {}

  /**
   * syncJobStates
   */
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

  /**
   * getActiveAuditSessions
   */
  private async getActiveAuditSessions() {
    return this.db.auditSession.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        jobId: { not: null },
      },
      select: { id: true, jobId: true, status: true, userId: true },
    });
  }

  /**
   * getActiveHuntSessions
   */
  private async getActiveHuntSessions() {
    return this.db.huntSession.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        jobId: { not: null },
      },
      select: { id: true, jobId: true, status: true, userId: true },
    });
  }

  /**
   * getOrphanedAuditSessions
   */
  private async getOrphanedAuditSessions() {
    return this.db.auditSession.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        jobId: null,
        createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
      },
      select: { id: true, status: true, createdAt: true },
    });
  }

  /**
   * getOrphanedHuntSessions
   */
  private async getOrphanedHuntSessions() {
    return this.db.huntSession.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        jobId: null,
        createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
      },
      select: { id: true, status: true, createdAt: true, userId: true },
    });
  }

  /**
   * syncAuditSessions
   */
  private async syncAuditSessions(
    activeSessions: Array<{ id: string; jobId: string | null; status: string; userId: string }>,
    orphanedSessions: Array<{ id: string; status: string; createdAt: Date }>
  ): Promise<{ synced: number; stalled: number }> {
    let synced = 0;
    let stalled = 0;

    /**
     * for
     */
    for (const session of activeSessions) {
      /**
       * if
       */
      if (!session.jobId) continue;

      const job = await this.jobs.getJob('leads', session.jobId);
      /**
       * if
       */
      if (!job) {
        logger.debug(`[AUDIT] Job ${session.jobId} not found, marking session as failed`);
        const updated = await this.db.auditSession.update({
          where: { id: session.id },
          data: {
            status: 'FAILED',
            error: 'Job not found in queue (worker may have crashed)',
            completedAt: new Date(),
          },
        });

        /**
         * if
         */
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
      /**
       * if
       */
      if (jobState === 'completed') {
        logger.debug(`[AUDIT] Job ${session.jobId} completed but session still processing, marking as completed`);
        await this.db.auditSession.update({
          where: { id: session.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });
        synced++;
      } else if (jobState === 'failed') {
        logger.debug(`[AUDIT] Job ${session.jobId} failed, marking session as failed`);
        await this.db.auditSession.update({
          where: { id: session.id },
          data: {
            status: 'FAILED',
            error: job.failedReason || 'Job failed',
            completedAt: new Date(),
          },
        });
        synced++;
      } else if (jobState === 'active') {
        logger.info({
          sessionId: session.id,
          jobId: session.jobId,
        }, '[AUDIT] Job was active during restart, retrying...');
        try {
          await job.moveToFailed(new Error('Server restart - job interrupted'), '0');
          const failedJob = await this.jobs.getJob('leads', session.jobId);
          /**
           * if
           */
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

    /**
     * for
     */
    for (const session of orphanedSessions) {
      logger.warn({
        sessionId: session.id,
        createdAt: session.createdAt,
      }, '[AUDIT] Found orphaned session without jobId, marking as failed');
      await this.db.auditSession.update({
        where: { id: session.id },
        data: {
          status: 'FAILED',
          error: 'No job ID found - session orphaned',
          completedAt: new Date(),
        },
      });
      stalled++;
    }

    return { synced, stalled };
  }

  /**
   * syncHuntSessions
   */
  private async syncHuntSessions(
    activeSessions: Array<{ id: string; jobId: string | null; status: string; userId: string }>,
    orphanedSessions: Array<{ id: string; status: string; createdAt: Date; userId: string }>
  ): Promise<{ synced: number; stalled: number }> {
    let synced = 0;
    let stalled = 0;

    /**
     * for
     */
    for (const session of activeSessions) {
      /**
       * if
       */
      if (!session.jobId) continue;

      const job = await this.jobs.getJob('leads', session.jobId);
      /**
       * if
       */
      if (!job) {
        logger.debug(`[HUNT] Job ${session.jobId} not found, marking session as failed`);
        await this.db.huntSession.update({
          where: { id: session.id },
          data: {
            status: 'FAILED',
            error: 'Job not found in queue (worker may have crashed)',
            completedAt: new Date(),
          },
        });

        /**
         * if
         */
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
      /**
       * if
       */
      if (jobState === 'completed') {
        logger.debug(`[HUNT] Job ${session.jobId} completed but session still processing, marking as completed`);
        await this.db.huntSession.update({
          where: { id: session.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });
        synced++;
      } else if (jobState === 'failed') {
        logger.debug(`[HUNT] Job ${session.jobId} failed, marking session as failed`);
        await this.db.huntSession.update({
          where: { id: session.id },
          data: {
            status: 'FAILED',
            error: job.failedReason || 'Job failed',
            completedAt: new Date(),
          },
        });
        synced++;
      } else if (jobState === 'active') {
        logger.info({
          sessionId: session.id,
          jobId: session.jobId,
        }, '[HUNT] Job was active during restart, retrying...');
        try {
          await job.moveToFailed(new Error('Server restart - job interrupted'), '0');
          const failedJob = await this.jobs.getJob('leads', session.jobId);
          /**
           * if
           */
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

    /**
     * for
     */
    for (const session of orphanedSessions) {
      logger.warn({
        sessionId: session.id,
        userId: session.userId,
        createdAt: session.createdAt,
      }, '[HUNT] Found orphaned session without jobId, marking as failed');
      await this.db.huntSession.update({
        where: { id: session.id },
        data: {
          status: 'FAILED',
          error: 'No job ID found - session orphaned',
          completedAt: new Date(),
        },
      });
      stalled++;
    }

    return { synced, stalled };
  }
}
