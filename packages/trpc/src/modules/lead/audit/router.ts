import { z } from 'zod';
import { router, protectedProcedure } from '../../../trpc';

export const listAuditSessionsSchema = z.object({
  leadId: z.string().optional(),
  // Add other filters as needed, e.g., status, pagination
  limit: z.number().min(1).max(100).default(10),
  offset: z.number().min(0).default(0),
});

export const auditRouter = router({
  list: protectedProcedure
    .input(listAuditSessionsSchema.optional())
    .query(async ({ ctx, input = {} }) => {
      try {
        const { leadId, limit = 10, offset = 0 } = input;
        const userId = ctx.user.id;

        let query = ctx.db`
          SELECT
            "AuditSession".id,
            "AuditSession"."userId",
            "AuditSession".status,
            "AuditSession".progress,
            "AuditSession"."totalLeads",
            "AuditSession"."processedLeads",
            "AuditSession"."updatedLeads",
            "AuditSession"."failedLeads",
            "AuditSession"."currentDomain",
            "AuditSession"."lastProcessedIndex",
            "AuditSession".error,
            "AuditSession"."startedAt",
            "AuditSession"."completedAt",
            "AuditSession"."createdAt",
            "AuditSession"."updatedAt",
            "Lead".id AS "lead.id",
            "Lead".domain AS "lead.domain",
            "Lead".email AS "lead.email",
            "Lead"."firstName" AS "lead.firstName",
            "Lead"."lastName" AS "lead.lastName"
          FROM "AuditSession"
          LEFT JOIN "Lead" ON "AuditSession"."leadId" = "Lead".id
          WHERE "AuditSession"."userId" = ${userId}
        `;

        let countQuery = ctx.db`
          SELECT COUNT(*)
          FROM "AuditSession"
          WHERE "AuditSession"."userId" = ${userId}
        `;

        if (leadId) {
          query = ctx.db`${query} AND "AuditSession"."leadId" = ${leadId}`;
          countQuery = ctx.db`${countQuery} AND "AuditSession"."leadId" = ${leadId}`;
        }

        query = ctx.db`${query} ORDER BY "AuditSession"."createdAt" DESC LIMIT ${limit} OFFSET ${offset}`;

        const auditSessionsRaw = await query;
        const totalAuditSessionsRaw = await countQuery;

        const totalAuditSessions = Number(totalAuditSessionsRaw[0].count);

        const auditSessions = auditSessionsRaw.map((row: any) => {
          const auditSession: any = {
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
          };

          // Reconstruct nested lead object if lead data exists
          if (row['lead.id']) {
            auditSession.lead = {
              id: row['lead.id'],
              domain: row['lead.domain'],
              email: row['lead.email'],
              firstName: row['lead.firstName'],
              lastName: row['lead.lastName'],
            };
          } else {
            auditSession.lead = null;
          }

          return auditSession;
        });

        return {
          auditSessions,
          totalAuditSessions,
        };
      } catch (error) {
        ctx.log.error({
          action: 'list-audit-sessions-failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new Error('Failed to retrieve audit sessions');
      }
    }),
  cancel: protectedProcedure
    .input(z.object({ auditSessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { auditSessionId } = input;
        const userId = ctx.user.id;

        const result = await ctx.db`
          UPDATE "AuditSession"
          SET
            status = 'CANCELLED',
            "updatedAt" = NOW()
          WHERE
            id = ${auditSessionId} AND "userId" = ${userId}
          RETURNING id;
        `;

        if (result.count === 0) {
          throw new Error('Audit session not found or not authorized to cancel');
        }

        ctx.log.info({
          action: 'audit-session-cancelled',
          auditSessionId,
          userId,
        });

        return { success: true, auditSessionId };
      } catch (error) {
        ctx.log.error({
          action: 'cancel-audit-session-failed',
          auditSessionId: input.auditSessionId,
          userId: ctx.user.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new Error('Failed to cancel audit session');
      }
    }),
});
