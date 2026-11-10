import { z } from 'zod';
import { router, humanProcedure } from '../../trpc';
import type { Context } from '../../context';
import * as service from './service';

const teamId = z.string().uuid().optional();
const bulleId = z.string().min(1).max(200);
const scoped = { forfait: { ids: 'scoped' } } as const;

export const ideasSpaceSchema = z.object({ teamId });
export const ideaSchema = z.object({ teamId, ideaId: bulleId });
export const runSchema = z.object({ teamId, runId: bulleId });
export const decideSchema = z.object({ teamId, runId: bulleId, callId: bulleId, approve: z.boolean() });

function deps(ctx: Context): service.IdeasDeps {
  return { prisma: ctx.prisma, bulle: ctx.bulle ?? null, forfait: ctx.forfait };
}

/**
 * Glouton's Ideas page, proxied to Bulle's per-app Ideas API with the
 * user's exchanged token. Bulle owns the ideas and runs; Glouton passes the
 * active space and checks the AI plan before anything is spent.
 */
export const ideasRouter = router({
  list: humanProcedure.meta({ forfait: { free: true } }).input(ideasSpaceSchema.optional()).query(({ ctx, input }) =>
    service.listIdeas(deps(ctx), { userId: ctx.user.id, teamId: input?.teamId })
  ),

  generate: humanProcedure.input(ideasSpaceSchema.optional()).mutation(({ ctx, input }) =>
    service.generateIdeas(deps(ctx), { userId: ctx.user.id, teamId: input?.teamId })
  ),

  run: humanProcedure.meta(scoped).input(ideaSchema).mutation(({ ctx, input }) =>
    service.runIdea(deps(ctx), { userId: ctx.user.id, teamId: input.teamId }, input.ideaId)
  ),

  runStatus: humanProcedure.meta({ forfait: { ...scoped.forfait, free: true } }).input(runSchema).query(({ ctx, input }) =>
    service.getRun(deps(ctx), { userId: ctx.user.id, teamId: input.teamId }, input.runId)
  ),

  decide: humanProcedure.meta(scoped).input(decideSchema).mutation(({ ctx, input }) =>
    service.decide(deps(ctx), { userId: ctx.user.id, teamId: input.teamId }, input.runId, input.callId, input.approve)
  ),

  dismiss: humanProcedure.meta(scoped).input(ideaSchema).mutation(({ ctx, input }) =>
    service.dismissIdea(deps(ctx), { userId: ctx.user.id, teamId: input.teamId }, input.ideaId)
  ),
});
