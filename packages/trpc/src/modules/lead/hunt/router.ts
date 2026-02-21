import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, protectedProcedure } from '../../../trpc';
import huntService from './service';
import {
  startHuntSchema,
  startLocalBusinessHuntSchema,
  huntStatusSchema,
  cancelHuntSchema,
  deleteHuntSchema,
} from '../schemas';
import { prisma } from '@repo/database/prisma';
import { resolveScope } from '../../../utils/scope';
import { getApiKeys } from '../../../utils/api-keys';

const getRunDetailsSchema = z.object({
  huntSessionId: z.string().uuid('Invalid hunt session ID'),
});

const getRunEventsSchema = z.object({
  huntSessionId: z.string().uuid('Invalid hunt session ID'),
  level: z.enum(['info', 'warning', 'error', 'success']).optional(),
  category: z.enum(['system', 'source', 'lead', 'enrichment']).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
});

export const huntRouter = router({
  start: protectedProcedure.input(startHuntSchema).mutation(async ({ ctx, input }) => {
    try {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId);
      const apiKeys = await getApiKeys(ctx.prisma, scope, ctx.env.ENCRYPTION_SECRET);

      const selectedSource = input.source || 'HUNTER';

      if (!apiKeys.hunterApiKey) {
        const contextType = scope.type === 'team' ? 'team' : 'your account';
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Hunter.io API key not configured for ${contextType}.`,
        });
      }

      return await huntService.startHunt({
        scope,
        apiKeys,
        ...input,
        source: selectedSource,
        jobs: ctx.jobs,
        prisma: ctx.prisma,
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      ctx.log.error({ action: 'start-hunt-failed', error });
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to start hunt' });
    }
  }),

  startLocalBusiness: protectedProcedure
    .input(startLocalBusinessHuntSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId);
        const apiKeys = await getApiKeys(ctx.prisma, scope, ctx.env.ENCRYPTION_SECRET);

        return await huntService.startLocalBusinessHunt({
          scope,
          apiKeys,
          ...input,
          googleMapsApiKey: apiKeys.googleMapsApiKey,
          jobs: ctx.jobs,
          prisma: ctx.prisma,
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Local hunt failed' });
      }
    }),

  list: protectedProcedure
    .input(z.object({ teamId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId);
      return await huntService.getHuntSessions(scope, ctx.prisma, ctx.jobs);
    }),

  getStatus: protectedProcedure.input(huntStatusSchema).query(async ({ ctx, input }) => {
    const session = await prisma.huntSession.findUnique({
      where: { id: input.huntSessionId },
    });

    if (!session) throw new TRPCError({ code: 'NOT_FOUND' });
    if (session.userId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });

    return session;
  }),

  cancel: protectedProcedure.input(cancelHuntSchema).mutation(async ({ ctx, input }) => {
    try {
      const result = await huntService.cancelHunt(
        input.huntSessionId,
        ctx.user.id,
        ctx.jobs,
        ctx.events
      );

      ctx.log.info({
        action: 'cancel-hunt',
        huntSessionId: input.huntSessionId,
      });

      return result;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      ctx.log.error({
        action: 'cancel-hunt-failed',
        huntSessionId: input.huntSessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Failed to cancel hunt',
        cause: error,
      });
    }
  }),

  delete: protectedProcedure.input(deleteHuntSchema).mutation(async ({ ctx, input }) => {
    const session = await prisma.huntSession.findUnique({
      where: { id: input.huntSessionId },
      select: { userId: true },
    });

    if (!session) throw new TRPCError({ code: 'NOT_FOUND' });
    if (session.userId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });

    await prisma.huntSession.delete({
      where: { id: input.huntSessionId },
    });

    return { success: true };
  }),

  getRunDetails: protectedProcedure
    .input(getRunDetailsSchema)
    .query(async ({ ctx, input }) => {
      try {
        const details = await huntService.getRunDetails(
          input.huntSessionId,
          ctx.user.id
        );

        ctx.log.info({
          action: 'get-hunt-run-details',
          huntSessionId: input.huntSessionId,
        });

        return details;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        ctx.log.error({
          action: 'get-hunt-run-details-failed',
          huntSessionId: input.huntSessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve hunt run details',
          cause: error,
        });
      }
    }),

  getRunEvents: protectedProcedure
    .input(getRunEventsSchema)
    .query(async ({ ctx, input }) => {
      try {
        const result = await huntService.getRunEvents(
          input.huntSessionId,
          ctx.user.id,
          {
            level: input.level,
            category: input.category,
            page: input.page,
            limit: input.limit,
          }
        );

        ctx.log.info({
          action: 'get-hunt-run-events',
          huntSessionId: input.huntSessionId,
          level: input.level,
          category: input.category,
          page: input.page,
        });

        return result;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        ctx.log.error({
          action: 'get-hunt-run-events-failed',
          huntSessionId: input.huntSessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve hunt run events',
          cause: error,
        });
      }
    }),
});
