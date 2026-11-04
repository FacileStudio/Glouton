import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../trpc';

/** The paywall's own data: whether the current scope has Glouton, and where to upgrade it. */
export const forfaitRouter = router({
  status: protectedProcedure
    .input(z.object({ teamId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const teamId = input?.teamId;
      const verdict = teamId ? await ctx.forfait.team(ctx.user.id, teamId) : await ctx.forfait.personal(ctx.user.id);
      if (!verdict) throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this team' });
      return {
        scope: teamId ? ('team' as const) : ('personal' as const),
        allowed: verdict.allowed,
        enforced: verdict.enforced,
        upgradeUrl: verdict.upgradeUrl,
        plans: ['Pro', 'Studio'],
      };
    }),
});
