import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../trpc';
import OpportunityService from './service';
import { listOpportunitiesSchema, getOpportunitySchema, markClickedSchema } from './schemas';

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

  get: protectedProcedure
    .input(getOpportunitySchema)
    .query(async ({ ctx, input }) => {
      try {
        const opportunity = await OpportunityService.getById({
          prisma: ctx.prisma,
          input,
          userId: ctx.user.id,
        });
        if (!opportunity) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Mission introuvable' });
        }
        return opportunity;
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        ctx.log.error({ action: 'opportunity-get-failed', error: err });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get opportunity' });
      }
    }),

  markClicked: protectedProcedure
    .input(markClickedSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await OpportunityService.markClicked({
          prisma: ctx.prisma,
          input,
          userId: ctx.user.id,
        });
      } catch (err) {
        ctx.log.error({ action: 'opportunity-mark-clicked-failed', error: err });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to mark clicked' });
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

  // Any signed-in user can request a refresh; a shared cooldown (see service)
  // makes sure the sources are scraped at most once per window.
  triggerScrape: protectedProcedure
    .mutation(async ({ ctx }) => {
      try {
        return await OpportunityService.triggerScrape({ jobs: ctx.jobs });
      } catch (err) {
        ctx.log.error({ action: 'opportunity-trigger-scrape-failed', error: err });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to trigger scrape' });
      }
    }),
});
