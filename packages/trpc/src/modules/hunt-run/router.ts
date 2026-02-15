import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../trpc';
import huntRunService from './service';

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

export const huntRunRouter = router({
  getRunDetails: protectedProcedure
    .input(getRunDetailsSchema)
    .query(async ({ ctx, input }) => {
      try {
        const details = await huntRunService.getRunDetails(
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
        /**
         * if
         */
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
        const result = await huntRunService.getRunEvents(
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
        /**
         * if
         */
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

export default huntRunRouter;
