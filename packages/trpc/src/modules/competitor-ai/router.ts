import { z } from 'zod';
import { router, protectedProcedure, humanProcedure } from '../../trpc';
import type { Context } from '../../context';
import { loadCompetitor } from '../competitor/service';
import { AI_LANGUAGES } from './prompt';
import * as service from './service';

const id = z.string().uuid();
const teamId = z.string().uuid().optional();
const language = z.enum(AI_LANGUAGES).default('fr');
const row = { model: 'competitor', key: 'competitorId' } as const;

export const competitorScope = z.object({ teamId, competitorId: id });
export const competitorAiSchema = competitorScope.extend({ language });
export const summarizeSchema = competitorScope.extend({ language, changeIds: z.array(id).min(1).max(30) });
export const snapshotSchema = competitorScope.extend({ snapshotId: id });

function deps(ctx: Context): service.AiDeps {
  return { prisma: ctx.prisma, bulle: ctx.bulle ?? null, forfait: ctx.forfait, web: ctx.web ?? null };
}

export const competitorAiRouter = router({
  draft: humanProcedure.meta({ forfait: { row } }).input(competitorAiSchema).mutation(async ({ ctx, input }) => {
    const { row: competitor, scope } = await loadCompetitor(ctx.prisma, ctx.user.id, input.competitorId, ctx.planMode, input.teamId);
    return service.draftBattlecard(deps(ctx), scope, competitor, input.language);
  }),

  summarize: humanProcedure.meta({ forfait: { row } }).input(summarizeSchema).mutation(async ({ ctx, input }) => {
    const { row: competitor, scope } = await loadCompetitor(ctx.prisma, ctx.user.id, input.competitorId, ctx.planMode, input.teamId);
    const owned = await ctx.prisma.pageChange.findMany({
      where: { id: { in: input.changeIds }, page: { competitorId: competitor.id } },
      select: { id: true },
    });
    const keys = { userId: ctx.user.id, teamId: scope.type === 'team' ? scope.teamId : null };
    return service.summarizeChanges(deps(ctx), keys, owned.map((change) => change.id), input.language);
  }),

  extractPrices: humanProcedure.meta({ forfait: { row } }).input(competitorAiSchema).mutation(async ({ ctx, input }) => {
    const { row: competitor, scope } = await loadCompetitor(ctx.prisma, ctx.user.id, input.competitorId, ctx.planMode, input.teamId);
    return service.extractPrices(deps(ctx), scope, competitor, input.language);
  }),

  prices: protectedProcedure.meta({ forfait: { free: true, row } }).input(competitorScope).query(async ({ ctx, input }) => {
    const { row: competitor } = await loadCompetitor(ctx.prisma, ctx.user.id, input.competitorId, ctx.planMode, input.teamId);
    return service.listPrices(ctx.prisma, competitor.id);
  }),

  snapshot: protectedProcedure.meta({ forfait: { free: true, row } }).input(snapshotSchema).query(async ({ ctx, input }) => {
    const { row: competitor } = await loadCompetitor(ctx.prisma, ctx.user.id, input.competitorId, ctx.planMode, input.teamId);
    return service.snapshotOf(ctx.prisma, competitor.id, input.snapshotId);
  }),
});
