import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../../trpc';
import LeadQueryService from './service';
import { listLeadsSchema, getByIdSchema, deleteLeadSchema } from '../schemas';
import { resolveScope } from '../../../utils/scope';
import { z } from 'zod';

export const queryRouter = router({
  list: protectedProcedure.input(listLeadsSchema).query(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId);
    return await LeadQueryService.getLeads({
      scope,
      prisma: ctx.prisma,
      filters: input ?? {},
    });
  }),

  getById: protectedProcedure.input(getByIdSchema).query(async ({ ctx, input }) => {
    return await LeadQueryService.getLeadById(input.leadId, ctx);
  }),

  delete: protectedProcedure.input(deleteLeadSchema).mutation(async ({ ctx, input }) => {
    return await LeadQueryService.deleteLead(input.leadId, ctx.user.id, ctx.prisma);
  }),

  getStats: protectedProcedure
    .input(z.object({ teamId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId);
      return await LeadQueryService.getStats(scope, ctx.prisma);
    }),

  getActiveSessions: protectedProcedure
    .input(z.object({ teamId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId);
      return await LeadQueryService.getActiveSessions(scope, ctx);
    }),
});
