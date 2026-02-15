import type { QueueManager } from '../queue-manager';
import type { SQL } from 'bun'; // Changed import
import logger from '@repo/logger';

export interface HealthMonitorOptions {
  checkIntervalMs?: number;
  sessionTimeout?: number;
  enableAutoRecovery?: boolean;
}

export class JobHealthMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private checkIntervalMs: number;
  private sessionTimeout: number;
  private enableAutoRecovery: boolean;
  private queueManager: QueueManager;
  private db: SQL; // Changed type
  private isRunning = false;

  /**
   * constructor
   */
  constructor(
    queueManager: QueueManager,
    db: SQL, // Changed type
    options: HealthMonitorOptions = {}
  ) {
    this.queueManager = queueManager;
    this.db = db;
    this.checkIntervalMs = options.checkIntervalMs ?? 60000;
    this.sessionTimeout = options.sessionTimeout ?? 3600000;
    this.enableAutoRecovery = options.enableAutoRecovery ?? true;
  }

  /**
   * start
   */
  start(): void {
    /**
     * if
     */
    if (this.isRunning) {
      logger.warn('[JobHealthMonitor] Already running');
      return;
    }

    logger.debug('[JobHealthMonitor] Starting');

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.checkJobHealth().catch((error) => {
        logger.error( '[JobHealthMonitor] Error checking job health');
      });
    }, this.checkIntervalMs);

    this.checkJobHealth().catch((error) => {
      logger.error( '[JobHealthMonitor] Error in initial health check');
    });
  }

  /**
   * stop
   */
  stop(): void {
    /**
     * if
     */
    if (this.intervalId) {
      /**
       * clearInterval
       */
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      logger.info('[JobHealthMonitor] Stopped job health monitoring');
    }
  }

  /**
   * checkJobHealth
   */
  private async checkJobHealth(): Promise<void> {
    try {
      await Promise.all([
        this.checkAuditSessions(),
        this.checkHuntSessions(),
        this.checkStuckJobs(),
      ]);
    } catch (error) {
      logger.error( '[JobHealthMonitor] Health check failed');
    }
  }

  /**
   * checkAuditSessions
   */
  private async checkAuditSessions(): Promise<void> {
    try {
      const sessions = await this.db`
        SELECT id, "jobId", status, "startedAt", "createdAt", "userId"
        FROM "AuditSession"
        WHERE status IN ('PENDING', 'PROCESSING')
      `;

      /**
       * for
       */
      for (const session of sessions) {
        const startTime = session.startedAt || session.createdAt;
        const elapsed = Date.now() - startTime.getTime();

        /**
         * if
         */
        if (elapsed > this.sessionTimeout) {
          logger.debug('[JobHealthMonitor] Audit session timed out');

          /**
           * if
           */
          if (this.enableAutoRecovery) {
            await this.db`
              UPDATE "AuditSession"
              SET status = 'FAILED',
                  error = 'Session timed out',
                  "completedAt" = ${new Date()}
              WHERE id = ${session.id}
            `;

            /**
             * if
             */
            if (globalThis.broadcastToUser) {
              globalThis.broadcastToUser(session.userId, {
                type: 'audit-failed',
                data: {
                  auditSessionId: session.id,
                  status: 'FAILED',
                  error: 'Session timed out',
                },
              });
            }

            logger.debug('[JobHealthMonitor] Marked audit as FAILED');
          }
        }

        /**
         * if
         */
        if (session.jobId) {
          await this.syncJobState('audit', session.id, session.jobId, session.status, session.userId);
        }
      }
    } catch (error) {
      logger.error( '[JobHealthMonitor] Error checking audit sessions');
    }
  }

  /**
   * checkHuntSessions
   */
  private async checkHuntSessions(): Promise<void> {
    try {
      const sessions = await this.db`
        SELECT id, "jobId", status, "startedAt", "createdAt", "userId"
        FROM "HuntSession"
        WHERE status IN ('PENDING', 'PROCESSING')
      `;

      /**
       * for
       */
      for (const session of sessions) {
        const startTime = session.startedAt || session.createdAt;
        const elapsed = Date.now() - startTime.getTime();

        /**
         * if
         */
        if (elapsed > this.sessionTimeout) {
          logger.debug('[JobHealthMonitor] Hunt session timed out');

          /**
           * if
           */
          if (this.enableAutoRecovery) {
            await this.db`
              UPDATE "HuntSession"
              SET status = 'FAILED',
                  error = 'Session timed out',
                  "completedAt" = ${new Date()}
              WHERE id = ${session.id}
            `;

            logger.debug('[JobHealthMonitor] Marked hunt as FAILED');
          }
        }

        /**
         * if
         */
        if (session.jobId) {
          await this.syncJobState('hunt', session.id, session.jobId, session.status, session.userId);
        }
      }
    } catch (error) {
      logger.error( '[JobHealthMonitor] Error checking hunt sessions');
    }
  }

  /**
   * syncJobState
   */
  private async syncJobState(
    type: 'audit' | 'hunt',
    sessionId: string,
    jobId: string,
    dbStatus: string,
    userId: string
  ): Promise<void> {
    try {
      const job = await this.queueManager.getJob('leads', jobId);

      /**
       * if
       */
      if (!job) {
        /**
         * if
         */
        if (dbStatus === 'PENDING' || dbStatus === 'PROCESSING') {
          logger.debug(`[JobHealthMonitor] ${type} job not found in queue`);

          /**
           * if
           */
          if (this.enableAutoRecovery) {
            const updateData = {
              status: 'FAILED' as const,
              error: 'Job not found in queue',
              completedAt: new Date(),
            };

            /**
             * if
             */
            if (type === 'audit') {
              await this.db`
                UPDATE "AuditSession"
                SET status = ${updateData.status},
                    error = ${updateData.error},
                    "completedAt" = ${updateData.completedAt}
                WHERE id = ${sessionId}
              `;

              /**
               * if
               */
              if (globalThis.broadcastToUser) {
                globalThis.broadcastToUser(userId, {
                  type: 'audit-failed',
                  data: { auditSessionId: sessionId, ...updateData },
                });
              }
            } else {
              await this.db`
                UPDATE "HuntSession"
                SET status = ${updateData.status},
                    error = ${updateData.error},
                    "completedAt" = ${updateData.completedAt}
                WHERE id = ${sessionId}
              `;
            }
          }
        }
        return;
      }

      const jobState = await job.getState();

      /**
       * if
       */
      if (jobState === 'completed' && dbStatus !== 'COMPLETED') {
        logger.debug(`[JobHealthMonitor] Syncing ${type} to COMPLETED`);

        /**
         * if
         */
        if (type === 'audit') {
          const returnValue = job.returnvalue;
          await this.db`
            UPDATE "AuditSession"
            SET status = 'COMPLETED',
                progress = 100,
                "totalLeads" = ${returnValue?.totalLeads ?? 0},
                "processedLeads" = ${returnValue?.processedLeads ?? 0},
                "updatedLeads" = ${returnValue?.updatedLeads ?? 0},
                "failedLeads" = ${returnValue?.failedLeads ?? 0},
                "completedAt" = ${new Date()}
            WHERE id = ${sessionId}
          `;

          /**
           * if
           */
          if (globalThis.broadcastToUser) {
            globalThis.broadcastToUser(userId, {
              type: 'audit-completed',
              data: {
                auditSessionId: sessionId,
                status: 'COMPLETED',
                progress: 100,
                ...returnValue,
              },
            });
          }
        } else {
          await this.db`
            UPDATE "HuntSession"
            SET status = 'COMPLETED',
                progress = 100,
                "completedAt" = ${new Date()}
            WHERE id = ${sessionId}
          `;
        }
      } else if (jobState === 'failed' && dbStatus !== 'FAILED') {
        logger.debug(`[JobHealthMonitor] Syncing ${type} to FAILED`);

        const updateData = {
          status: 'FAILED' as const,
          error: job.failedReason || 'Job failed',
          completedAt: new Date(),
        };

        /**
         * if
         */
        if (type === 'audit') {
          await this.db`
            UPDATE "AuditSession"
            SET status = ${updateData.status},
                error = ${updateData.error},
                "completedAt" = ${updateData.completedAt}
            WHERE id = ${sessionId}
          `;

          /**
           * if
           */
          if (globalThis.broadcastToUser) {
            globalThis.broadcastToUser(userId, {
              type: 'audit-failed',
              data: { auditSessionId: sessionId, ...updateData },
            });
          }
        } else {
          await this.db`
            UPDATE "HuntSession"
            SET status = ${updateData.status},
                error = ${updateData.error},
                "completedAt" = ${updateData.completedAt}
            WHERE id = ${sessionId}
          `;
        }
      }
    } catch (error) {
      logger.error(`[JobHealthMonitor] Error syncing ${type} state`);
    }
  }

  /**
   * checkStuckJobs
   */
  private async checkStuckJobs(): Promise<void> {
    try {
      const metrics = await this.queueManager.getQueueMetrics('leads');

      /**
       * if
       */
      if (metrics.active > 0) {
        const activeJobs = await this.queueManager.getJobs('leads', ['active']);
        const now = Date.now();

        /**
         * for
         */
        for (const job of activeJobs) {
          const processingTime = job.processedOn ? now - job.processedOn : 0;

          /**
           * if
           */
          if (processingTime > this.sessionTimeout) {
            logger.debug(`[JobHealthMonitor] Job ${job.id} stuck in active state for ${Math.round(processingTime / 1000 / 60)}min - forcing failure`);

            /**
             * if
             */
            if (this.enableAutoRecovery) {
              try {
                await job.moveToFailed(
                  new Error(`Job timed out after ${Math.round(processingTime / 1000 / 60)} minutes`),
                  '0',
                  true
                );
                logger.debug(`[JobHealthMonitor] Successfully failed stuck job ${job.id}`);
              } catch (failError) {
                logger.error(`[JobHealthMonitor] Failed to move job ${job.id} to failed state`);
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error( '[JobHealthMonitor] Error checking stuck jobs');
    }
  }

  /**
   * getHealthStatus
   */
  async getHealthStatus(): Promise<{
    isRunning: boolean;
    queues: Record<string, {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    }>;
    sessions: {
      audits: { pending: number; processing: number; stuck: number };
      hunts: { pending: number; processing: number; stuck: number };
    };
  }> {
    const [leadsMetrics, auditSessions, huntSessions] = await Promise.all([
      this.queueManager.getQueueMetrics('leads'),
      this.db`
        SELECT id, status, "startedAt", "createdAt"
        FROM "AuditSession"
        WHERE status IN ('PENDING', 'PROCESSING')
      ` as Promise<any[]>,
      this.db`
        SELECT id, status, "startedAt", "createdAt"
        FROM "HuntSession"
        WHERE status IN ('PENDING', 'PROCESSING')
      ` as Promise<any[]>,
    ]);

    const now = Date.now();
    const stuckAudits = auditSessions.filter(s => {
      const startTime = s.startedAt || s.createdAt;
      return now - startTime.getTime() > this.sessionTimeout;
    }).length;

    const stuckHunts = huntSessions.filter(s => {
      const startTime = s.startedAt || s.createdAt;
      return now - startTime.getTime() > this.sessionTimeout;
    }).length;

    return {
      isRunning: this.isRunning,
      queues: {
        leads: leadsMetrics,
      },
      sessions: {
        audits: {
          pending: auditSessions.filter(s => s.status === 'PENDING').length,
          processing: auditSessions.filter(s => s.status === 'PROCESSING').length,
          stuck: stuckAudits,
        },
        hunts: {
          pending: huntSessions.filter(s => s.status === 'PENDING').length,
          processing: huntSessions.filter(s => s.status === 'PROCESSING').length,
          stuck: stuckHunts,
        },
      },
    };
  }
}
