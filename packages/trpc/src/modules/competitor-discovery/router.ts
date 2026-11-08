import { router, protectedProcedure } from '../../trpc';
import { resolveScope } from '../../utils/scope';
import { acceptAboveSchema, listSuggestionsSchema, scopeSchema, suggestionIdSchema } from './schemas';
import * as service from './service';

const scoped = { ids: 'scoped' } as const;

export const competitorDiscoveryRouter = router({
  list: protectedProcedure.meta({ forfait: { free: true } }).input(listSuggestionsSchema).query(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode);
    return service.listSuggestions(ctx.prisma, scope, input?.status);
  }),

  counts: protectedProcedure.meta({ forfait: { free: true } }).input(scopeSchema).query(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode);
    return service.suggestionCounts(ctx.prisma, scope);
  }),

  run: protectedProcedure.input(scopeSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode);
    return service.requestRun(ctx.prisma, ctx.jobs, scope);
  }),

  markSeen: protectedProcedure.input(scopeSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode);
    return service.markSeen(ctx.prisma, scope);
  }),

  accept: protectedProcedure.meta({ forfait: scoped }).input(suggestionIdSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return service.acceptSuggestion(ctx.prisma, scope, input.suggestionId);
  }),

  reject: protectedProcedure.meta({ forfait: scoped }).input(suggestionIdSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return service.rejectSuggestion(ctx.prisma, scope, input.suggestionId);
  }),

  restore: protectedProcedure.meta({ forfait: scoped }).input(suggestionIdSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return service.restoreSuggestion(ctx.prisma, scope, input.suggestionId);
  }),

  acceptAbove: protectedProcedure.input(acceptAboveSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return service.acceptAbove(ctx.prisma, scope, input.minScore);
  }),
});
