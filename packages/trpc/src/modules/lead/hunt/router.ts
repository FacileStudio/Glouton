import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../../trpc';
import leadService from '../service';
import {
  startHuntSchema,
  startLocalBusinessHuntSchema,
  huntStatusSchema,
  cancelHuntSchema,
  deleteHuntSchema,
} from '../schemas';

export const huntRouter = router({
  start: protectedProcedure.input(startHuntSchema).mutation(async ({ ctx, input }) => {
    try {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
      });

      /**
       * if
       */
      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'User not found. Please log in again.',
        });
      }

      const apiKeyMap: Record<string, string | null | undefined> = {
        HUNTER: user.hunterApiKey,
        APOLLO: user.apolloApiKey,
        SNOV: user.snovApiKey,
        HASDATA: user.hasdataApiKey,
        CONTACTOUT: user.contactoutApiKey,
      };

      const selectedSource = input.source || 'HUNTER';
      const apiKey = apiKeyMap[selectedSource];

      /**
       * if
       */
      if (!apiKey) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${selectedSource} API key not configured. Please add your API key in settings.`,
        });
      }

      const result = await leadService.startHunt({
        userId: ctx.user.id,
        source: selectedSource,
        targetUrl: input.targetUrl,
        companyName: input.companyName,
        speed: input.speed,
        filters: input.filters,
        jobs: ctx.jobs,
        db: ctx.db,
      });

      ctx.log.info({
        action: 'start-hunt',
        huntSessionId: result.huntSessionId,
        source: selectedSource,
        targetUrl: input.targetUrl,
        speed: input.speed,
      });

      return result;
    } catch (error) {
      /**
       * if
       */
      if (error instanceof TRPCError) {
        throw error;
      }

      ctx.log.error({
        action: 'start-hunt-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        targetUrl: input.targetUrl,
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Failed to start hunt session',
        cause: error,
      });
    }
  }),

  startLocalBusiness: protectedProcedure.input(startLocalBusinessHuntSchema).mutation(async ({ ctx, input }) => {
    try {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
      });

      /**
       * if
       */
      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'User not found. Please log in again.',
        });
      }

      const result = await leadService.startLocalBusinessHunt({
        userId: ctx.user.id,
        location: input.location,
        categories: input.categories,
        hasWebsite: input.hasWebsite,
        radius: input.radius,
        maxResults: input.maxResults,
        googleMapsApiKey: user.googleMapsApiKey || undefined,
        jobs: ctx.jobs,
        db: ctx.db,
      });

      ctx.log.info({
        action: 'start-local-business-hunt',
        huntSessionId: result.huntSessionId,
        location: input.location,
        categories: input.categories,
      });

      return result;
    } catch (error) {
      /**
       * if
       */
      if (error instanceof TRPCError) {
        throw error;
      }

      ctx.log.error({
        action: 'start-local-business-hunt-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        location: input.location,
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Failed to start local business hunt',
        cause: error,
      });
    }
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      const sessions = await leadService.getHuntSessions(ctx.user.id, ctx.db, ctx.jobs);
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

  getStatus: protectedProcedure.input(huntStatusSchema).query(async ({ ctx, input }) => {
    try {
      const session = await leadService.getHuntSessionStatus(input.huntSessionId, ctx.db);

      /**
       * if
       */
      if (session.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this hunt session',
        });
      }

      return session;
    } catch (error) {
      /**
       * if
       */
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

  cancel: protectedProcedure.input(cancelHuntSchema).mutation(async ({ ctx, input }) => {
    try {
      const session = await ctx.db.huntSession.findUnique({
        where: { id: input.huntSessionId },
      });

      /**
       * if
       */
      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Hunt session not found',
        });
      }

      /**
       * if
       */
      if (session.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this hunt session',
        });
      }

      /**
       * if
       */
      if (session.status === 'COMPLETED' || session.status === 'FAILED' || session.status === 'CANCELLED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot cancel a hunt that is already ${session.status.toLowerCase()}`,
        });
      }

      const updatedSession = await ctx.db.huntSession.update({
        where: { id: input.huntSessionId },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
        },
      });

      ctx.log.info({
        action: 'cancel-hunt',
        huntSessionId: input.huntSessionId,
      });

      return updatedSession;
    } catch (error) {
      /**
       * if
       */
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
        message: 'Failed to cancel hunt session',
        cause: error,
      });
    }
  }),

  delete: protectedProcedure.input(deleteHuntSchema).mutation(async ({ ctx, input }) => {
    try {
      const session = await ctx.db.huntSession.findUnique({
        where: { id: input.huntSessionId },
      });

      /**
       * if
       */
      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Hunt session not found',
        });
      }

      /**
       * if
       */
      if (session.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this hunt session',
        });
      }

      await ctx.db.huntSession.delete({
        where: { id: input.huntSessionId },
      });

      ctx.log.info({
        action: 'delete-hunt',
        huntSessionId: input.huntSessionId,
      });

      return { success: true };
    } catch (error) {
      /**
       * if
       */
      if (error instanceof TRPCError) {
        throw error;
      }

      ctx.log.error({
        action: 'delete-hunt-failed',
        huntSessionId: input.huntSessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete hunt session',
        cause: error,
      });
    }
  }),
});
