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
      const filters = input ?? {};

      const result = await leadService.getLeads({
        userId: ctx.user.id,
        db: ctx.db,
        filters,
      });

      return result;
    } catch (error) {
      ctx.log.error({
        action: 'list-leads-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve leads',
        cause: error,
      });
    }
  }),

  getById: protectedProcedure.input(getByIdSchema).query(async ({ ctx, input }) => {
    try {
      const lead = await ctx.db.lead.findUnique({
        where: { id: input.id },
      });

      /**
       * if
       */
      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lead not found',
        });
      }

      /**
       * if
       */
      if (lead.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this lead',
        });
      }

      return lead;
    } catch (error) {
      /**
       * if
       */
      if (error instanceof TRPCError) {
        throw error;
      }

      ctx.log.error({
        action: 'get-lead-by-id-failed',
        leadId: input.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve lead',
        cause: error,
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
      /**
       * if
       */
      if (error instanceof Error && error.message === 'Unauthorized to delete this lead') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this lead',
        });
      }

      /**
       * if
       */
      if (error instanceof Error && error.message === 'Lead not found') {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lead not found',
        });
      }

      ctx.log.error({
        action: 'delete-lead-failed',
        leadId: input.leadId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete lead',
        cause: error,
      });
    }
  }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    try {
      const stats = await leadService.getStats(ctx.user.id, ctx.db);

      return stats;
    } catch (error) {
      ctx.log.error({
        action: 'get-stats-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve statistics',
        cause: error,
      });
    }
  }),

  getActiveSessions: protectedProcedure.query(async ({ ctx }) => {
    try {
      const [activeAudits, activeHunts] = await Promise.all([
        ctx.db.auditSession.findMany({
          where: {
            userId: ctx.user.id,
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            progress: true,
            totalLeads: true,
            processedLeads: true,
            updatedLeads: true,
            failedLeads: true,
            currentDomain: true,
            startedAt: true,
            createdAt: true,
          },
        }),
        ctx.db.huntSession.findMany({
          where: {
            userId: ctx.user.id,
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            targetUrl: true,
            status: true,
            progress: true,
            totalLeads: true,
            successfulLeads: true,
            failedLeads: true,
            startedAt: true,
            createdAt: true,
          },
        }),
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
        cause: error,
      });
    }
  }),
});
