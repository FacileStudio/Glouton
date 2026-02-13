import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../trpc';
import leadService from './service';

const startHuntSchema = z.object({
  targetUrl: z
    .string()
    .url('Please enter a valid URL')
    .refine(
      (url) => {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
      },
      { message: 'URL must use http or https protocol' }
    ),
  speed: z
    .number()
    .int('Speed must be an integer')
    .min(1, 'Speed must be at least 1')
    .max(10, 'Speed must not exceed 10'),
});

const listLeadsSchema = z
  .object({
    status: z.enum(['HOT', 'WARM', 'COLD']).optional(),
    search: z.string().optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .optional();

const huntStatusSchema = z.object({
  huntSessionId: z.string().uuid('Invalid hunt session ID'),
});

const deleteLeadSchema = z.object({
  leadId: z.string().uuid('Invalid lead ID'),
});

export const leadRouter = router({
  startHunt: protectedProcedure.input(startHuntSchema).mutation(async ({ ctx, input }) => {
    try {
      const result = await leadService.startHunt({
        userId: ctx.user.id,
        targetUrl: input.targetUrl,
        speed: input.speed,
        jobs: ctx.jobs,
        db: ctx.db,
      });

      ctx.log.info({
        action: 'start-hunt',
        huntSessionId: result.huntSessionId,
        targetUrl: input.targetUrl,
        speed: input.speed,
      });

      return result;
    } catch (error) {
      ctx.log.error({
        action: 'start-hunt-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        targetUrl: input.targetUrl,
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to start hunt session',
        cause: error,
      });
    }
  }),

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

  getHuntSessions: protectedProcedure.query(async ({ ctx }) => {
    try {
      const sessions = await leadService.getHuntSessions(ctx.user.id, ctx.db);
      return sessions;
    } catch (error) {
      ctx.log.error({
        action: 'get-hunt-sessions-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve hunt sessions',
        cause: error,
      });
    }
  }),

  getHuntStatus: protectedProcedure.input(huntStatusSchema).query(async ({ ctx, input }) => {
    try {
      const session = await leadService.getHuntSessionStatus(input.huntSessionId, ctx.db);

      if (session.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this hunt session',
        });
      }

      return session;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      ctx.log.error({
        action: 'get-hunt-status-failed',
        huntSessionId: input.huntSessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'NOT_FOUND',
        message: error instanceof Error ? error.message : 'Hunt session not found',
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
      if (error instanceof Error && error.message === 'Unauthorized to delete this lead') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this lead',
        });
      }

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
});

export default leadRouter;
