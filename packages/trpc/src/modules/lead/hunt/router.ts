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
      const [user] = await ctx.db`SELECT "hunterApiKey" FROM "User" WHERE id = ${ctx.user.id}`;

      if (!user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not found.' });
      }

      const selectedSource = input.source || 'HUNTER';

      if (!user.hunterApiKey) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Hunter.io API key not configured.`,
        });
      }

      return await huntService.startHunt({
        userId: ctx.user.id,
        source: selectedSource,
        ...input,
        jobs: ctx.jobs,
        db: ctx.db,
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
        const [user] =
          await ctx.db`SELECT "googleMapsApiKey" FROM "User" WHERE id = ${ctx.user.id}`;
        if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });

        return await huntService.startLocalBusinessHunt({
          userId: ctx.user.id,
          ...input,
          googleMapsApiKey: user.googleMapsApiKey,
          jobs: ctx.jobs,
          db: ctx.db,
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Local hunt failed' });
      }
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return await huntService.getHuntSessions(ctx.user.id, ctx.db, ctx.jobs);
  }),

  getStatus: protectedProcedure.input(huntStatusSchema).query(async ({ ctx, input }) => {
    const [session] = await ctx.db`SELECT * FROM "HuntSession" WHERE id = ${input.huntSessionId}`;

    if (!session) throw new TRPCError({ code: 'NOT_FOUND' });
    if (session.userId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });

    return session;
  }),

  cancel: protectedProcedure.input(cancelHuntSchema).mutation(async ({ ctx, input }) => {
    try {
      const result = await huntService.cancelHunt(
        input.huntSessionId,
        ctx.user.id,
        ctx.db,
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
    const [session] =
      await ctx.db`SELECT "userId" FROM "HuntSession" WHERE id = ${input.huntSessionId}`;

    if (!session) throw new TRPCError({ code: 'NOT_FOUND' });
    if (session.userId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });

    await ctx.db`DELETE FROM "HuntSession" WHERE id = ${input.huntSessionId}`;

    return { success: true };
  }),

  getRunDetails: protectedProcedure
    .input(getRunDetailsSchema)
    .query(async ({ ctx, input }) => {
      try {
        const details = await huntService.getRunDetails(
          input.huntSessionId,
          ctx.user.id,
          ctx.db
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
          ctx.db,
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
