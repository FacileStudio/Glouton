import { z } from 'zod';
import { router, protectedProcedure, humanProcedure } from '../../trpc';
import type { Context } from '../../context';
import { resolveScope } from '../../utils/scope';
import { loadLead } from '../competitor/outcome';
import { AI_LANGUAGES } from '../competitor-ai/prompt';
import type { AiDeps } from '../competitor-ai/service';
import { explainLead, rankLeads } from './service';

const teamId = z.string().uuid().optional();
const row = { model: 'lead', key: 'leadId' } as const;

export const rankSchema = z.object({
  teamId,
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).max(500).default(0),
  minScore: z.number().int().min(0).max(100).optional(),
});

export const explainSchema = z.object({ teamId, leadId: z.string().uuid(), language: z.enum(AI_LANGUAGES).default('fr') });

function deps(ctx: Context): AiDeps {
  return { prisma: ctx.prisma, bulle: ctx.bulle ?? null, forfait: ctx.forfait, web: null };
}

export const leadScoreRouter = router({
  list: protectedProcedure
    .meta({ forfait: { free: true } })
    .input(rankSchema)
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
      return rankLeads(ctx.prisma, scope, input);
    }),

  explain: humanProcedure
    .meta({ forfait: { row } })
    .input(explainSchema)
    .mutation(async ({ ctx, input }) => {
      const { lead: found, scope } = await loadLead(ctx.prisma, ctx.user.id, input.leadId, ctx.planMode, input.teamId);
      const lead = await ctx.prisma.lead.findUniqueOrThrow({ where: { id: found.id } });
      return explainLead(deps(ctx), scope, lead, input.language);
    }),
});
