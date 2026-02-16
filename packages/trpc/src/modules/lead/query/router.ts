import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../../trpc';
import LeadQueryService from './service';
import { listLeadsSchema, getByIdSchema, deleteLeadSchema } from '../schemas';

export const queryRouter = router({
  list: protectedProcedure.input(listLeadsSchema).query(async ({ ctx, input }) => {
    return await LeadQueryService.getLeads({
      userId: ctx.user.id,
      db: ctx.db,
      filters: input ?? {},
    });
  }),

  getById: protectedProcedure.input(getByIdSchema).query(async ({ ctx, input }) => {
    return await LeadQueryService.getLeadById(input.id, ctx);
  }),

  delete: protectedProcedure.input(deleteLeadSchema).mutation(async ({ ctx, input }) => {
    return await LeadQueryService.deleteLead(input.id, ctx);
  }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    return await LeadQueryService.getStats(ctx.user.id, ctx.db);
  }),

  getActiveSessions: protectedProcedure.query(async ({ ctx }) => {
    LeadQueryService.getActiveSessions(ctx);
  }),
});
