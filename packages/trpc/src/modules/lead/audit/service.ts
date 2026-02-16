import { SQL } from 'bun';
import type { QueueManager } from '@repo/jobs';

export interface ListAuditParams {
  leadId?: string;
  limit?: number;
  offset?: number;
}

export interface AuditContext {
  user: { id: string };
  jobs: QueueManager;
  db: SQL;
  log: {
    info: (data: any) => void;
    error: (data: any) => void;
  };
  events?: {
    emit: (userId: string, type: string, data?: any) => void;
  };
}

export default {
  async list(input: ListAuditParams, ctx: AuditContext) {
    try {
      const { leadId, limit = 10, offset = 0 } = input;
      const userId = ctx.user.id;

      const whereLeadId = leadId ? ctx.db`AND "AuditSession"."leadId" = ${leadId}` : ctx.db``;

      const auditSessions = (await ctx.db`
          SELECT
            s.id, s."userId", s.status, s.progress, s."totalLeads",
            s."processedLeads", s."updatedLeads", s."failedLeads",
            s."currentDomain", s."lastProcessedIndex", s.error,
            s."startedAt", s."completedAt", s."createdAt", s."updatedAt",
            l.id AS "lead_id",
            l.domain AS "lead_domain",
            l.email AS "lead_email",
            l."firstName" AS "lead_firstName",
            l."lastName" AS "lead_lastName"
          FROM "AuditSession" s
          LEFT JOIN "Lead" l ON s."leadId" = l.id
          WHERE s."userId" = ${userId}
          ${whereLeadId}
          ORDER BY s."createdAt" DESC
          LIMIT ${limit} OFFSET ${offset}
        `) as any[];

      const [countResult] = (await ctx.db`
          SELECT COUNT(*) as count
          FROM "AuditSession"
          WHERE "userId" = ${userId}
          ${whereLeadId}
        `) as any[];

      const totalAuditSessions = Number(countResult.count);

      const formattedSessions = auditSessions.map((row: any) => ({
        id: row.id,
        userId: row.userId,
        status: row.status,
        progress: row.progress,
        totalLeads: row.totalLeads,
        processedLeads: row.processedLeads,
        updatedLeads: row.updatedLeads,
        failedLeads: row.failedLeads,
        currentDomain: row.currentDomain,
        lastProcessedIndex: row.lastProcessedIndex,
        error: row.error,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lead: row.lead_id
          ? {
              id: row.lead_id,
              domain: row.lead_domain,
              email: row.lead_email,
              firstName: row.lead_firstName,
              lastName: row.lead_lastName,
            }
          : null,
      }));

      return {
        auditSessions: formattedSessions,
        totalAuditSessions,
      };
    } catch (error) {
      ctx.log.error({ action: 'list-audit-sessions-failed', error });
      throw new Error('Failed to retrieve audit sessions');
    }
  },

  async cancel(auditSessionId: string, ctx: AuditContext) {
    try {
      const [session] = (await ctx.db`
      SELECT id, "jobId", status
      FROM "AuditSession"
      WHERE id = ${auditSessionId} AND "userId" = ${ctx.user.id}
    `) as any[];

      if (!session) {
        throw new Error('Audit session not found or unauthorized');
      }

      // Check if already completed or cancelled
      if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
        return { success: true, auditSessionId: session.id, status: session.status };
      }

      // Update the session status to CANCELLED
      // The worker will check this status and stop processing
      const [result] = (await ctx.db`
      UPDATE "AuditSession"
      SET
        status = 'CANCELLED',
        "updatedAt" = NOW(),
        "completedAt" = NOW()
      WHERE id = ${auditSessionId}
      RETURNING id, "processedLeads", "updatedLeads", "failedLeads", "totalLeads";
    `) as any[];

      // Try to remove the job if it's not being processed
      // This will work for waiting/delayed jobs but fail for active jobs (which is okay)
      if (session.jobId) {
        const queue = ctx.jobs['queues'].get('leads');
        if (queue) {
          const job = await queue.getJob(session.jobId);
          if (job) {
            const state = await job.getState();
            if (state === 'waiting' || state === 'delayed') {
              // Only try to remove if job is not being actively processed
              await job.remove().catch(() => {
                // Ignore error if job can't be removed (it's being processed)
                ctx.log.info({ action: 'job-actively-processing', jobId: session.jobId });
              });
            }
          }
        }
      }

      // Emit WebSocket event for cancellation
      if (ctx.events) {
        ctx.events.emit(ctx.user.id, 'audit-cancelled', {
          auditSessionId: result.id,
          processedLeads: result.processedLeads || 0,
          updatedLeads: result.updatedLeads || 0,
          failedLeads: result.failedLeads || 0,
          totalLeads: result.totalLeads || 0
        });
      }

      ctx.log.info({ action: 'audit-cancelled', auditSessionId: result.id });

      return { success: true, auditSessionId: result.id };
    } catch (error) {
      ctx.log.error({ action: 'cancel-audit-session-failed', error });
      throw error instanceof Error ? error : new Error('Failed to cancel audit session');
    }
  },

  async start(ctx: AuditContext) {
    const userId = ctx.user.id;
    const jobs = ctx.jobs;
    const db = ctx.db;

    if (!userId) {
      throw new Error('userId is required to start an audit session');
    }

    const existingSessions = await db`
    SELECT id, "jobId"
    FROM "AuditSession"
    WHERE "userId" = ${userId}
      AND status IN ('PENDING', 'PROCESSING')
  `;

    for (const session of existingSessions) {
      try {
        await db`
        UPDATE "AuditSession"
        SET status = 'CANCELLED', "completedAt" = ${new Date()}
        WHERE id = ${session.id}
      `;

        if (session.jobId) {
          const queue = jobs['queues'].get('leads');
          if (queue) {
            const job = await queue.getJob(session.jobId);
            if (job) await job.remove().catch(() => {});
          }
        }
      } catch (error) {
        console.warn(`[Audit] Failed cleanup for session ${session.id}:`, error);
      }
    }

    const [auditSession] = await db`
    INSERT INTO "AuditSession" (
      id, "userId", status, progress, "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid(), ${userId}, 'PENDING', 0, ${new Date()}, ${new Date()}
    )
    RETURNING id, status, "createdAt"
  `;

    try {
      const job = await jobs.addJob(
        'leads',
        'lead-audit',
        { auditSessionId: auditSession.id, userId },
        { timeout: 21600000 }
      );

      // Use a single atomic transaction to avoid race conditions
      await db.begin(async (tx) => {
        // Clear any existing sessions with this jobId
        await tx`
          UPDATE "AuditSession"
          SET "jobId" = NULL
          WHERE "jobId" = ${job.id} AND id != ${auditSession.id}
        `;

        // Set the jobId for the current session
        await tx`
          UPDATE "AuditSession"
          SET "jobId" = ${job.id}
          WHERE id = ${auditSession.id}
        `;
      });

      if (ctx.events) {
        ctx.events.emit(userId, 'audit-started', {
          auditSessionId: auditSession.id,
          status: 'PENDING',
          progress: 0,
          totalLeads: 0,
          processedLeads: 0,
          updatedLeads: 0,
          failedLeads: 0,
        });
      }

      return {
        auditSessionId: auditSession.id,
        status: auditSession.status,
        createdAt: auditSession.createdAt,
      };
    } catch (error) {
      await db`
      UPDATE "AuditSession"
      SET status = 'FAILED',
          error = ${error instanceof Error ? error.message : 'Failed to start audit job'},
          "completedAt" = ${new Date()}
      WHERE id = ${auditSession.id}
    `;
      throw error;
    }
  },

  async getAuditSession(auditSessionId: string, userId: string, db: SQL) {
    const [session] = (await db`
      SELECT *
      FROM "AuditSession"
      WHERE id = ${auditSessionId} AND "userId" = ${userId}
    `) as any[];

    if (!session) {
      throw new Error('Audit session not found or unauthorized');
    }

    return session;
  },

  async updateAuditProgress(
    auditSessionId: string,
    progress: number,
    processedLeads: number,
    updatedLeads: number,
    failedLeads: number,
    currentDomain: string | null,
    db: SQL
  ) {
    await db`
      UPDATE "AuditSession"
      SET
        progress = ${progress},
        "processedLeads" = ${processedLeads},
        "updatedLeads" = ${updatedLeads},
        "failedLeads" = ${failedLeads},
        "currentDomain" = ${currentDomain},
        "updatedAt" = ${new Date()}
      WHERE id = ${auditSessionId}
    `;
  },

  async completeAudit(
    auditSessionId: string,
    status: 'COMPLETED' | 'FAILED',
    error: string | null,
    db: SQL
  ) {
    await db`
      UPDATE "AuditSession"
      SET
        status = ${status},
        error = ${error},
        "completedAt" = ${new Date()},
        "updatedAt" = ${new Date()}
      WHERE id = ${auditSessionId}
    `;
  },
};

