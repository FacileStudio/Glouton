export default {
  list: async (input, ctx) => {
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

      // 3. Compte total
      const [countResult] = (await ctx.db`
          SELECT COUNT(*) as count
          FROM "AuditSession"
          WHERE "userId" = ${userId}
          ${whereLeadId}
        `) as any[];

      const totalAuditSessions = Number(countResult.count);

      const formattedSessions = auditSessions.map((row) => ({
        ...row,
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

  cancel: async (input, ctx) => {
    try {
      const [result] = (await ctx.db`
          UPDATE "AuditSession"
          SET status = 'CANCELLED', "updatedAt" = NOW()
          WHERE id = ${input.auditSessionId} AND "userId" = ${ctx.user.id}
          RETURNING id;
        `) as any[];

      if (!result) {
        throw new Error('Audit session not found or unauthorized');
      }

      return { success: true, auditSessionId: result.id };
    } catch (error) {
      ctx.log.error({ action: 'cancel-audit-session-failed', error });
      throw new Error('Failed to cancel audit session');
    }
  },
  start: async (ctx: { user: any; jobs: any; db: any }) => {
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
        SET status = 'CANCELLED',
            "completedAt" = ${new Date()}
        WHERE id = ${session.id}
      `;

        if (session.jobId) {
          const queue = jobs['queues'].get('leads');
          if (queue) {
            const job = await queue.getJob(session.jobId);
            if (job) {
              const state = await job.getState();
              if (state === 'waiting' || state === 'delayed') {
                await job.remove();
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to cancel existing audit session ${session.id}:`, error);
      }
    }

    const [auditSession] = await db`
    INSERT INTO "AuditSession" (
      id,
      "userId", 
      status, 
      progress, 
      "createdAt", 
      "updatedAt"
    ) VALUES (
      gen_random_uuid(),
      ${userId},
      'PENDING',
      0,
      ${new Date()},
      ${new Date()}
    )
    RETURNING id, status, "createdAt"
  `;

    try {
      const job = await jobs.addJob(
        'leads',
        'lead-audit',
        {
          auditSessionId: auditSession.id,
          userId,
        },
        {
          timeout: 21600000,
        }
      );

      await db`
      UPDATE "AuditSession"
      SET "jobId" = ${job.id}
      WHERE id = ${auditSession.id}
    `;

      return {
        auditSessionId: auditSession.id,
        status: auditSession.status,
        createdAt: auditSession.createdAt,
      };
    } catch (error) {
      // 6. Rollback status to FAILED if the job queue fails
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
};
