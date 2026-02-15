import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../../trpc';
import { OpportunityService } from './service';
import { OpportunitySource, OpportunityCategory } from '@repo/opportunity-scraper';

const opportunitySourceEnum = z.nativeEnum(OpportunitySource);
const opportunityCategoryEnum = z.nativeEnum(OpportunityCategory);

export const opportunityRouter = router({
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    return OpportunityService.getPreferences(ctx.db, ctx.user.id);
  }),

  updatePreferences: protectedProcedure
    .input(
      z.object({
        discordWebhook: z.string().url().nullable().optional(),
        enableDiscordNotifications: z.boolean().optional(),
        enabledSources: z.array(opportunitySourceEnum).optional(),
        enabledCategories: z.array(opportunityCategoryEnum).optional(),
        keywords: z.array(z.string()).optional(),
        excludeKeywords: z.array(z.string()).optional(),
        minBudget: z.number().min(0).nullable().optional(),
        remoteOnly: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return OpportunityService.updatePreferences(ctx.db, ctx.user.id, input);
    }),

  testDiscordWebhook: protectedProcedure
    .input(
      z.object({
        webhookUrl: z.string().url(),
      })
    )
    .mutation(async ({ input }) => {
      return OpportunityService.testDiscordWebhook(input.webhookUrl);
    }),

  list: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        sources: z.array(z.string()).optional(),
        categories: z.array(z.string()).optional(),
        remoteOnly: z.boolean().optional(),
        minBudget: z.number().optional(),
        maxBudget: z.number().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return OpportunityService.list(ctx.db, input);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return OpportunityService.getById(ctx.db, input.id);
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    return OpportunityService.getStats(ctx.db);
  }),

  triggerScrape: adminProcedure
    .input(
      z.object({
        sources: z.array(opportunitySourceEnum).min(1, 'At least one source is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return OpportunityService.triggerManualScrape(ctx.jobs, input.sources);
    }),

  saveSearch: protectedProcedure
    .input(
      z.object({
        query: z.string().optional(),
        sources: z.array(opportunitySourceEnum).optional(),
        categories: z.array(opportunityCategoryEnum).optional(),
        remoteOnly: z.boolean().optional(),
        minBudget: z.number().optional(),
        maxBudget: z.number().optional(),
        resultsCount: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return OpportunityService.saveSearch(ctx.db, ctx.user.id, input);
    }),

  getSearchHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      return OpportunityService.getSearchHistory(ctx.db, ctx.user.id, input?.limit);
    }),

  deleteSearchHistory: protectedProcedure
    .input(z.object({ searchId: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      return OpportunityService.deleteSearchHistory(ctx.db, ctx.user.id, input?.searchId);
    }),

  getNewOpportunitiesSince: protectedProcedure
    .input(z.object({ since: z.string().datetime().transform((val) => new Date(val)) }))
    .query(async ({ ctx, input }) => {
      return OpportunityService.getNewOpportunitiesSince(ctx.db, input.since);
    }),
});
