import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../../trpc';
import leadService from '../service';
import {
  listLeadsSchema,
  getByIdSchema,
  deleteLeadSchema,
} from '../schemas';

export const queryRouter = router({
  list: protectedProcedure.input(listLeadsSchema).query(async ({ ctx, input }) => {
    try {
      // Le leadService doit également être mis à jour pour accepter l'instance Bun SQL
      return await leadService.getLeads({
        userId: ctx.user.id,
        db: ctx.db,
        filters: input ?? {},
      });
    } catch (error) {
      ctx.log.error({
        action: 'list-leads-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve leads',
      });
    }
  }),

  getById: protectedProcedure.input(getByIdSchema).query(async ({ ctx, input }) => {
    try {
      // Utilisation de Bun SQL pour récupérer un lead unique
      const [lead] = await ctx.db`
        SELECT * FROM "Lead" 
        WHERE id = ${input.id} 
        LIMIT 1
      ` as any[];

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lead not found',
        });
      }

      if (lead.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this lead',
        });
      }

      return lead;
    } catch (error) {
      if (error instanceof TRPCError) throw error;

      ctx.log.error({
        action: 'get-lead-by-id-failed',
        leadId: input.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve lead',
      });
    }
  }),

  delete: protectedProcedure.input(deleteLeadSchema).mutation(async ({ ctx, input }) => {
    try {
      const result = await leadService.deleteLead(input.leadId, ctx.user.id, ctx.db);

      ctx.log.info({
        action: 'delete-lead',
        leadId: input.leadId,
      });

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      
      if (msg === 'Unauthorized to delete this lead') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Unauthorized access' });
      }
      if (msg === 'Lead not found') {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lead not found' });
      }

      ctx.log.error({
        action: 'delete-lead-failed',
        leadId: input.leadId,
        error: msg,
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete lead',
      });
    }
  }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await leadService.getStats(ctx.user.id, ctx.db);
    } catch (error) {
      ctx.log.error({
        action: 'get-stats-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve statistics',
      });
    }
  }),

  getActiveSessions: protectedProcedure.query(async ({ ctx }) => {
    try {
      // Récupération parallèle des sessions avec Bun SQL
      const [activeAudits, activeHunts] = await Promise.all([
        ctx.db`
          SELECT 
            id, status, progress, "totalLeads", "processedLeads", 
            "updatedLeads", "failedLeads", "currentDomain", "startedAt", "createdAt"
          FROM "AuditSession"
          WHERE "userId" = ${ctx.user.id} AND status IN ('PENDING', 'PROCESSING')
          ORDER BY "createdAt" DESC
        ` as Promise<any[]>,
        ctx.db`
          SELECT 
            id, "targetUrl", status, progress, "totalLeads", 
            "successfulLeads", "failedLeads", "startedAt", "createdAt"
          FROM "HuntSession"
          WHERE "userId" = ${ctx.user.id} AND status IN ('PENDING', 'PROCESSING')
          ORDER BY "createdAt" DESC
        ` as Promise<any[]>,
      ]);

      return {
        audits: activeAudits,
        hunts: activeHunts,
      };
    } catch (error) {
      ctx.log.error({
        action: 'get-active-sessions-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve active sessions',
      });
    }
  }),
});
