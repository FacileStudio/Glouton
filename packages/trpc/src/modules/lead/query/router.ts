import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, humanProcedure } from '../../../trpc';
import LeadQueryService from './service';
import { listLeadsSchema, getByIdSchema, deleteLeadSchema } from '../schemas';
import { resolveScope } from '../../../utils/scope';
import { z } from 'zod';

export const queryRouter = router({
  list: protectedProcedure.meta({ forfait: { free: true } }).input(listLeadsSchema).query(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode);
    return await LeadQueryService.getLeads({
      scope,
      prisma: ctx.prisma,
      filters: input ?? {},
    });
  }),

  getById: protectedProcedure.meta({ forfait: { free: true, row: { model: 'lead', key: 'leadId' } } }).input(getByIdSchema).query(async ({ ctx, input }) => {
    return await LeadQueryService.getLeadById(input.leadId, ctx);
  }),

  delete: humanProcedure.meta({ forfait: { free: true, row: { model: 'lead', key: 'leadId' } } }).input(deleteLeadSchema).mutation(async ({ ctx, input }) => {
    return await LeadQueryService.deleteLead(input.leadId, ctx.user.id, ctx.prisma);
  }),

  getStats: protectedProcedure.meta({ forfait: { free: true } })
    .input(z.object({ teamId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode);
      return await LeadQueryService.getStats(scope, ctx.prisma);
    }),

  getActiveSessions: protectedProcedure.meta({ forfait: { free: true } })
    .input(z.object({ teamId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode);
      return await LeadQueryService.getActiveSessions(scope, ctx);
    }),
});
