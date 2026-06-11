import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../../trpc';
import OpportunityService from './service';
import { listOpportunitiesSchema } from './schemas';

export const opportunityRouter = router({
  list: protectedProcedure
    .input(listOpportunitiesSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await OpportunityService.list({ prisma: ctx.prisma, input });
      } catch (err) {
        ctx.log.error({ action: 'opportunity-list-failed', error: err });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list opportunities' });
      }
    }),

  stats: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        return await OpportunityService.getStats({ prisma: ctx.prisma });
      } catch (err) {
        ctx.log.error({ action: 'opportunity-stats-failed', error: err });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get stats' });
      }
    }),

  triggerScrape: adminProcedure
    .mutation(async ({ ctx }) => {
      try {
        return await OpportunityService.triggerScrape({ jobs: ctx.jobs });
      } catch (err) {
        ctx.log.error({ action: 'opportunity-trigger-scrape-failed', error: err });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to trigger scrape' });
      }
    }),
});
