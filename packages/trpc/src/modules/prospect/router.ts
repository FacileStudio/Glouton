import { z } from 'zod';
import { router, protectedProcedure, humanProcedure } from '../../trpc';
import { resolveScope } from '../../utils/scope';
import { profileFieldsSchema, profileFor, saveProfile } from './profile';
import { suggestTargets, suggestTargetsSchema } from './suggest';

const teamId = z.string().uuid().optional();

export const prospectRouter = router({
  get: protectedProcedure
    .meta({ forfait: { free: true } })
    .input(z.object({ teamId }).optional())
    .query(async ({ ctx, input }) => profileFor(ctx.prisma, await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode))),

  save: protectedProcedure.input(profileFieldsSchema.extend({ teamId })).mutation(async ({ ctx, input }) => {
    const { teamId: team, ...fields } = input;
    return saveProfile(ctx.prisma, await resolveScope(ctx.prisma, ctx.user.id, team, ctx.planMode), fields);
  }),

  suggestTargets: humanProcedure.input(suggestTargetsSchema).mutation(async ({ ctx, input }) => {
    const { teamId: team, ...rest } = input;
    const scope = await resolveScope(ctx.prisma, ctx.user.id, team, ctx.planMode);
    return suggestTargets({ bulle: ctx.bulle ?? null, forfait: ctx.forfait }, scope, rest);
  }),
});
