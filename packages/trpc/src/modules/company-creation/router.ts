import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, humanProcedure } from '../../trpc';
import CompanyCreationService from './service';
import {
  listCompanyCreationsSchema,
  getCompanyCreationSchema,
  convertToLeadSchema,
} from './schemas';

export const companyCreationRouter = router({
  list: protectedProcedure
    .input(listCompanyCreationsSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await CompanyCreationService.list({ prisma: ctx.prisma, input });
      } catch (err) {
        ctx.log.error({ action: 'company-creation-list-failed', error: err });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list company creations',
        });
      }
    }),

  get: protectedProcedure
    .input(getCompanyCreationSchema)
    .query(async ({ ctx, input }) => {
      try {
        const item = await CompanyCreationService.getById({
          prisma: ctx.prisma,
          input,
        });
        if (!item) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Company creation not found',
          });
        }
        return item;
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        ctx.log.error({ action: 'company-creation-get-failed', error: err });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get company creation',
        });
      }
    }),

  stats: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        return await CompanyCreationService.getStats({ prisma: ctx.prisma });
      } catch (err) {
        ctx.log.error({ action: 'company-creation-stats-failed', error: err });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get company creation stats',
        });
      }
    }),

  convertToLead: humanProcedure
    .input(convertToLeadSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await CompanyCreationService.convertToLead({
          prisma: ctx.prisma,
          input,
          userId: ctx.user.id,
        });
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        ctx.log.error({
          action: 'company-creation-convert-to-lead-failed',
          error: err,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to convert company creation to lead',
        });
      }
    }),

  triggerScrape: protectedProcedure
    .mutation(async ({ ctx }) => {
      try {
        return await CompanyCreationService.triggerScrape({ jobs: ctx.jobs });
      } catch (err) {
        ctx.log.error({
          action: 'company-creation-trigger-scrape-failed',
          error: err,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to trigger scrape',
        });
      }
    }),
});
