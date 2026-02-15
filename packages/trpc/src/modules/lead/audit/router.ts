import { z } from 'zod';
import { router, protectedProcedure } from '../../../trpc';

export const listAuditSessionsSchema = z.object({
  leadId: z.string().optional(),
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

        // 1. Définir la condition de base
        const whereLeadId = leadId ? ctx.db`AND "AuditSession"."leadId" = ${leadId}` : ctx.db``;

        // 2. Requête principale (Composition récursive)
        const auditSessions = await ctx.db`
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
        ` as any[];

        // 3. Compte total
        const [countResult] = await ctx.db`
          SELECT COUNT(*) as count
          FROM "AuditSession"
          WHERE "userId" = ${userId}
          ${whereLeadId}
        ` as any[];

        const totalAuditSessions = Number(countResult.count);

        // 4. Mapping des résultats (Transformation des noms de colonnes "lead_xxx" en objet imbriqué)
        const formattedSessions = auditSessions.map((row) => ({
          ...row,
          lead: row.lead_id ? {
            id: row.lead_id,
            domain: row.lead_domain,
            email: row.lead_email,
            firstName: row.lead_firstName,
            lastName: row.lead_lastName,
          } : null
        }));

        return {
          auditSessions: formattedSessions,
          totalAuditSessions,
        };
      } catch (error) {
        ctx.log.error({ action: 'list-audit-sessions-failed', error });
        throw new Error('Failed to retrieve audit sessions');
      }
    }),

  cancel: protectedProcedure
    .input(z.object({ auditSessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const [result] = await ctx.db`
          UPDATE "AuditSession"
          SET status = 'CANCELLED', "updatedAt" = NOW()
          WHERE id = ${input.auditSessionId} AND "userId" = ${ctx.user.id}
          RETURNING id;
        ` as any[];

        if (!result) {
          throw new Error('Audit session not found or unauthorized');
        }

        return { success: true, auditSessionId: result.id };
      } catch (error) {
        ctx.log.error({ action: 'cancel-audit-session-failed', error });
        throw new Error('Failed to cancel audit session');
      }
    }),
});
