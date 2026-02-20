import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../../trpc';
import LeadQueryService from './service';
import { listLeadsSchema, getByIdSchema, deleteLeadSchema } from '../schemas';

export const queryRouter = router({
  list: protectedProcedure.input(listLeadsSchema).query(async ({ ctx, input }) => {
    return await LeadQueryService.getLeads({
      userId: ctx.user.id,
      prisma: ctx.prisma,
      filters: input ?? {},
    });
  }),

  getById: protectedProcedure.input(getByIdSchema).query(async ({ ctx, input }) => {
    return await LeadQueryService.getLeadById(input.id, ctx);
  }),

  delete: protectedProcedure.input(deleteLeadSchema).mutation(async ({ ctx, input }) => {
    return await LeadQueryService.deleteLead(input.id, ctx.user.id, ctx.prisma);
  }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    return await LeadQueryService.getStats(ctx.user.id, ctx.prisma);
  }),

  getActiveSessions: protectedProcedure.query(async ({ ctx }) => {
    return await LeadQueryService.getActiveSessions(ctx);
  }),
});
