import { z } from 'zod';
import { router, protectedProcedure, humanProcedure } from '../../trpc';
import type { Context } from '../../context';
import { resolveScope } from '../../utils/scope';
import { createFromProfile, createFromSession, createSchedule } from './create';
import { createScheduleSchema, fromProfileSchema, fromSessionSchema, scheduleIdSchema, updateScheduleSchema } from './schemas';
import {
  listSchedules,
  loadSchedule,
  pauseSchedule,
  resumeSchedule,
  runNow,
  updateSchedule,
  type ScheduleDeps,
} from './service';
import { suggestSegments } from './suggest';

const row = { model: 'huntSchedule', key: 'scheduleId' } as const;
const sessionRow = { model: 'huntSession', key: 'huntSessionId' } as const;
const teamId = z.string().uuid().optional();

function deps(ctx: Context): ScheduleDeps {
  return { prisma: ctx.prisma, jobs: ctx.jobs };
}

export const huntScheduleRouter = router({
  list: protectedProcedure
    .meta({ forfait: { free: true } })
    .input(z.object({ teamId }).optional())
    .query(async ({ ctx, input }) => listSchedules(ctx.prisma, await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode))),

  create: protectedProcedure.input(createScheduleSchema).mutation(async ({ ctx, input }) => {
    const { teamId: team, frequency, name, runNow: now, ...filters } = input;
    const scope = await resolveScope(ctx.prisma, ctx.user.id, team, ctx.planMode);
    return createSchedule(deps(ctx), scope, { frequency, name, runNow: now, filters });
  }),

  createFromSession: protectedProcedure
    .meta({ forfait: { row: sessionRow } })
    .input(fromSessionSchema)
    .mutation(async ({ ctx, input }) => createFromSession(deps(ctx), ctx.user.id, ctx.planMode, input)),

  createFromProfile: protectedProcedure.input(fromProfileSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return createFromProfile(deps(ctx), scope, input.frequency);
  }),

  update: protectedProcedure
    .meta({ forfait: { row } })
    .input(updateScheduleSchema)
    .mutation(async ({ ctx, input }) => {
      const { row: schedule } = await loadSchedule(ctx.prisma, ctx.user.id, input.scheduleId, ctx.planMode, input.teamId);
      return updateSchedule(ctx.prisma, schedule, { frequency: input.frequency, name: input.name });
    }),

  pause: protectedProcedure
    .meta({ forfait: { row } })
    .input(scheduleIdSchema)
    .mutation(async ({ ctx, input }) => {
      const { row: schedule } = await loadSchedule(ctx.prisma, ctx.user.id, input.scheduleId, ctx.planMode, input.teamId);
      return pauseSchedule(ctx.prisma, schedule);
    }),

  resume: protectedProcedure
    .meta({ forfait: { row } })
    .input(scheduleIdSchema)
    .mutation(async ({ ctx, input }) => {
      const { row: schedule, scope } = await loadSchedule(ctx.prisma, ctx.user.id, input.scheduleId, ctx.planMode, input.teamId);
      return resumeSchedule(deps(ctx), schedule, scope);
    }),

  runNow: protectedProcedure
    .meta({ forfait: { row } })
    .input(scheduleIdSchema)
    .mutation(async ({ ctx, input }) => {
      const { row: schedule } = await loadSchedule(ctx.prisma, ctx.user.id, input.scheduleId, ctx.planMode, input.teamId);
      return runNow(deps(ctx), schedule);
    }),

  delete: humanProcedure
    .meta({ forfait: { free: true, row } })
    .input(scheduleIdSchema)
    .mutation(async ({ ctx, input }) => {
      const { row: schedule } = await loadSchedule(ctx.prisma, ctx.user.id, input.scheduleId, ctx.planMode, input.teamId);
      await ctx.prisma.huntSchedule.delete({ where: { id: schedule.id } });
      return { success: true };
    }),

  suggestSegments: humanProcedure
    .input(z.object({ teamId, language: z.enum(['fr', 'en']).optional() }))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
      return suggestSegments(ctx.prisma, ctx.bulle ?? null, scope, input.language ?? 'fr');
    }),
});
