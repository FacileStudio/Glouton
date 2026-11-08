import { router, protectedProcedure, humanProcedure } from '../../trpc';
import { resolveScope } from '../../utils/scope';
import { loadCompetitor } from '../competitor/service';
import {
  addPageSchema,
  changesSchema,
  competitorScopeSchema,
  markSeenSchema,
  pageIdSchema,
  unseenCountsSchema,
  updatePageSchema,
} from './schemas';
import * as service from './service';

const row = { model: 'competitor', key: 'competitorId' } as const;

export const competitorWatchRouter = router({
  pages: protectedProcedure.meta({ forfait: { free: true, row } }).input(competitorScopeSchema).query(async ({ ctx, input }) => {
    const { row: competitor, scope } = await loadCompetitor(ctx.prisma, ctx.user.id, input.competitorId, ctx.planMode, input.teamId);
    return service.listPages(ctx.prisma, scope, competitor.id);
  }),

  addPage: protectedProcedure.meta({ forfait: { row } }).input(addPageSchema).mutation(async ({ ctx, input }) => {
    const { row: competitor, scope } = await loadCompetitor(ctx.prisma, ctx.user.id, input.competitorId, ctx.planMode, input.teamId);
    return service.addPage(ctx.prisma, scope, competitor.id, {
      url: input.url,
      selector: input.selector,
      kind: input.kind,
      thresholdPct: input.thresholdPct,
      enabled: input.enabled,
    });
  }),

  updatePage: protectedProcedure.meta({ forfait: { row } }).input(updatePageSchema).mutation(async ({ ctx, input }) => {
    const { row: competitor } = await loadCompetitor(ctx.prisma, ctx.user.id, input.competitorId, ctx.planMode, input.teamId);
    return service.updatePage(ctx.prisma, competitor.id, input.pageId, {
      url: input.url,
      selector: input.selector,
      kind: input.kind,
      thresholdPct: input.thresholdPct,
      enabled: input.enabled,
    });
  }),

  deletePage: humanProcedure.meta({ forfait: { free: true, row } }).input(pageIdSchema).mutation(async ({ ctx, input }) => {
    const { row: competitor } = await loadCompetitor(ctx.prisma, ctx.user.id, input.competitorId, ctx.planMode, input.teamId);
    return service.removePage(ctx.prisma, competitor.id, input.pageId);
  }),

  changes: protectedProcedure.meta({ forfait: { free: true, row } }).input(changesSchema).query(async ({ ctx, input }) => {
    const { row: competitor } = await loadCompetitor(ctx.prisma, ctx.user.id, input.competitorId, ctx.planMode, input.teamId);
    return service.listChanges(ctx.prisma, competitor.id, { pageId: input.pageId, limit: input.limit });
  }),

  markSeen: protectedProcedure.meta({ forfait: { row } }).input(markSeenSchema).mutation(async ({ ctx, input }) => {
    const { row: competitor } = await loadCompetitor(ctx.prisma, ctx.user.id, input.competitorId, ctx.planMode, input.teamId);
    return service.markSeen(ctx.prisma, competitor.id, input.changeIds);
  }),

  unseenCounts: protectedProcedure.meta({ forfait: { free: true } }).input(unseenCountsSchema).query(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode);
    return service.unseenCounts(ctx.prisma, scope);
  }),
});
