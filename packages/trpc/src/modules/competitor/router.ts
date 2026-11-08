import { router, protectedProcedure, humanProcedure } from '../../trpc';
import { resolveScope } from '../../utils/scope';
import {
  closeLeadSchema,
  compareCompetitorsSchema,
  competitorIdSchema,
  createCompetitorSchema,
  listCompetitorsSchema,
  reopenLeadSchema,
  updateCompetitorSchema,
} from './schemas';
import * as service from './service';
import * as outcome from './outcome';

const row = { model: 'competitor', key: 'competitorId' } as const;
const leadRow = { model: 'lead', key: 'leadId' } as const;

export const competitorRouter = router({
  list: protectedProcedure.meta({ forfait: { free: true } }).input(listCompetitorsSchema).query(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode);
    return service.listCompetitors(ctx.prisma, scope, { q: input?.q || undefined, tag: input?.tag || undefined, status: input?.status });
  }),

  get: protectedProcedure.meta({ forfait: { free: true, row } }).input(competitorIdSchema).query(async ({ ctx, input }) => {
    const { row: competitor, scope } = await service.loadCompetitor(ctx.prisma, ctx.user.id, input.competitorId, ctx.planMode, input.teamId);
    return service.getCompetitor(ctx.prisma, competitor, scope);
  }),

  compare: protectedProcedure.meta({ forfait: { free: true, ids: 'scoped' } }).input(compareCompetitorsSchema).query(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return service.compareCompetitors(ctx.prisma, scope, input.competitorIds);
  }),

  create: protectedProcedure.input(createCompetitorSchema).mutation(async ({ ctx, input }) => {
    const { teamId, ...fields } = input;
    const scope = await resolveScope(ctx.prisma, ctx.user.id, teamId, ctx.planMode);
    return service.createCompetitor(ctx.prisma, scope, fields);
  }),

  update: protectedProcedure.meta({ forfait: { row } }).input(updateCompetitorSchema).mutation(async ({ ctx, input }) => {
    const { teamId, competitorId, ...fields } = input;
    const { row: competitor, scope } = await service.loadCompetitor(ctx.prisma, ctx.user.id, competitorId, ctx.planMode, teamId);
    return service.updateCompetitor(ctx.prisma, competitor, scope, fields);
  }),

  delete: humanProcedure.meta({ forfait: { free: true, row } }).input(competitorIdSchema).mutation(async ({ ctx, input }) => {
    const { row: competitor } = await service.loadCompetitor(ctx.prisma, ctx.user.id, input.competitorId, ctx.planMode, input.teamId);
    await ctx.prisma.competitor.delete({ where: { id: competitor.id } });
    return { success: true };
  }),

  closeLead: protectedProcedure.meta({ forfait: { row: leadRow } }).input(closeLeadSchema).mutation(async ({ ctx, input }) => {
    return outcome.closeLead(ctx.prisma, ctx.user.id, ctx.planMode, input);
  }),

  reopenLead: protectedProcedure.meta({ forfait: { row: leadRow } }).input(reopenLeadSchema).mutation(async ({ ctx, input }) => {
    return outcome.reopenLead(ctx.prisma, ctx.user.id, ctx.planMode, input.leadId, input.teamId);
  }),
});
