import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../../trpc';
import leadService from '../service';
import {
  startHuntSchema,
  startLocalBusinessHuntSchema,
  huntStatusSchema,
  cancelHuntSchema,
  deleteHuntSchema,
} from '../schemas';

export const huntRouter = router({
  start: protectedProcedure.input(startHuntSchema).mutation(async ({ ctx, input }) => {
    try {
      const [user] = await ctx.db`SELECT * FROM "User" WHERE id = ${ctx.user.id}`;

      if (!user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not found.' });
      }

      const apiKeyMap: Record<string, string | null> = {
        HUNTER: user.hunterApiKey,
        APOLLO: user.apolloApiKey,
        SNOV: user.snovApiKey,
        HASDATA: user.hasdataApiKey,
        CONTACTOUT: user.contactoutApiKey,
      };

      const selectedSource = input.source || 'HUNTER';
      const apiKey = apiKeyMap[selectedSource];

      if (!apiKey) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${selectedSource} API key not configured.`,
        });
      }

      return await leadService.startHunt({
        userId: ctx.user.id,
        source: selectedSource,
        ...input,
        jobs: ctx.jobs,
        db: ctx.db,
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      ctx.log.error({ action: 'start-hunt-failed', error });
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to start hunt' });
    }
  }),

  startLocalBusiness: protectedProcedure
    .input(startLocalBusinessHuntSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const [user] =
          await ctx.db`SELECT "googleMapsApiKey" FROM "User" WHERE id = ${ctx.user.id}`;
        if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });

        return await leadService.startLocalBusinessHunt({
          userId: ctx.user.id,
          ...input,
          googleMapsApiKey: user.googleMapsApiKey,
          jobs: ctx.jobs,
          db: ctx.db,
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Local hunt failed' });
      }
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return await leadService.getHuntSessions(ctx.user.id, ctx.db, ctx.jobs);
  }),

  getStatus: protectedProcedure.input(huntStatusSchema).query(async ({ ctx, input }) => {
    const [session] = await ctx.db`SELECT * FROM "HuntSession" WHERE id = ${input.huntSessionId}`;

    if (!session) throw new TRPCError({ code: 'NOT_FOUND' });
    if (session.userId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });

    return session;
  }),

  cancel: protectedProcedure.input(cancelHuntSchema).mutation(async ({ ctx, input }) => {
    const [session] =
      await ctx.db`SELECT status, "userId" FROM "HuntSession" WHERE id = ${input.huntSessionId}`;

    if (!session) throw new TRPCError({ code: 'NOT_FOUND' });
    if (session.userId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });

    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(session.status)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Hunt already finished' });
    }

    const [updated] = await ctx.db`
      UPDATE "HuntSession" 
      SET status = 'CANCELLED', "completedAt" = ${new Date()} 
      WHERE id = ${input.huntSessionId}
      RETURNING *
    `;

    return updated;
  }),

  delete: protectedProcedure.input(deleteHuntSchema).mutation(async ({ ctx, input }) => {
    const [session] =
      await ctx.db`SELECT "userId" FROM "HuntSession" WHERE id = ${input.huntSessionId}`;

    if (!session) throw new TRPCError({ code: 'NOT_FOUND' });
    if (session.userId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });

    await ctx.db`DELETE FROM "HuntSession" WHERE id = ${input.huntSessionId}`;

    return { success: true };
  }),
});
