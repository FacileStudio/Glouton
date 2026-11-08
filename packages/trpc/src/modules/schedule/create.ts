import type { HuntFrequency, Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import { readHuntFilters, type HuntFilters } from '../../utils/json';
import { resolveScope, type Scope } from '../../utils/scope';
import type { PlanMode } from '../forfait/gate';
import { profileFor } from '../prospect/profile';
import { addPeriod } from './cadence';
import { scheduleFiltersSchema, type fromSessionSchema, type ScheduleFilters } from './schemas';
import { defaultName, ensureRoom, reload, scheduleFilter, startRun, type ScheduleDeps } from './service';

function toJson(filters: ScheduleFilters): Prisma.InputJsonValue {
  return {
    location: filters.location,
    categories: filters.categories,
    ...(filters.hasWebsite !== undefined ? { hasWebsite: filters.hasWebsite } : {}),
    ...(filters.radius !== undefined ? { radius: filters.radius } : {}),
    ...(filters.maxResults !== undefined ? { maxResults: filters.maxResults } : {}),
  };
}

/**
 * Creates an enabled schedule. With `runNow` the first run starts at once
 * and the next one is a period later; otherwise the next tick starts it.
 */
export async function createSchedule(
  deps: ScheduleDeps,
  scope: Scope,
  input: { frequency: HuntFrequency; name?: string; runNow?: boolean; filters: ScheduleFilters },
  now = new Date()
) {
  await ensureRoom(deps.prisma, scope, 1);
  const row = await deps.prisma.huntSchedule.create({
    data: {
      userId: scope.userId,
      teamId: scope.type === 'team' ? scope.teamId : null,
      name: input.name || defaultName(input.filters),
      huntType: 'LOCAL_BUSINESS',
      filters: toJson(input.filters),
      frequency: input.frequency,
      nextRunAt: now,
    },
  });
  const huntSessionId = input.runNow ? await startRun(deps, row, now) : null;
  return { ...(await reload(deps.prisma, row.id)), huntSessionId };
}

/** Repeats an existing hunt: same filters, first repeat one period from now. The hunt itself stays unlinked. */
export async function createFromSession(
  deps: ScheduleDeps,
  userId: string,
  mode: PlanMode,
  input: z.infer<typeof fromSessionSchema>,
  now = new Date()
) {
  const session = await deps.prisma.huntSession.findUnique({ where: { id: input.huntSessionId } });
  if (!session) throw new TRPCError({ code: 'NOT_FOUND', message: 'Hunt session not found' });
  if (input.teamId && input.teamId !== session.teamId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Hunt session not found' });
  if (!session.teamId && session.userId !== userId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Hunt session not found' });
  const scope = await resolveScope(deps.prisma, userId, session.teamId, mode);
  const filters = readHuntFilters(session.filters);
  if (session.huntType !== 'LOCAL_BUSINESS' || !filters?.location || !filters.categories?.length) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only a local business hunt with a place and categories can repeat' });
  }
  await ensureRoom(deps.prisma, scope, 1);
  const parsed = scheduleFiltersSchema.parse(filters);
  const row = await deps.prisma.huntSchedule.create({
    data: {
      userId: scope.userId,
      teamId: scope.type === 'team' ? scope.teamId : null,
      name: defaultName(parsed),
      filters: toJson(parsed),
      frequency: input.frequency,
      nextRunAt: addPeriod(input.frequency, now),
    },
  });
  return reload(deps.prisma, row.id);
}

function sameTarget(filters: HuntFilters | null, location: string, category: string): boolean {
  return (
    filters?.location?.trim().toLowerCase() === location.trim().toLowerCase() &&
    filters.categories?.length === 1 &&
    filters.categories[0] === category
  );
}

/**
 * Creates one schedule per target category of the scope's profile, around
 * the profile's area, skipping categories that already have one there. The
 * new schedules are due at once; the tick paces their first runs.
 */
export async function createFromProfile(deps: ScheduleDeps, scope: Scope, frequency: HuntFrequency, now = new Date()) {
  const profile = await profileFor(deps.prisma, scope);
  if (!profile.area) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add an area to the prospecting profile first' });
  if (profile.targetCategories.length === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add target categories to the prospecting profile first' });
  }
  const area = profile.area;
  const existing = await deps.prisma.huntSchedule.findMany({ where: scheduleFilter(scope), select: { filters: true } });
  const missing = profile.targetCategories.filter(
    (category) => !existing.some((row) => sameTarget(readHuntFilters(row.filters), area, category))
  );
  if (missing.length > 0) await ensureRoom(deps.prisma, scope, missing.length);
  for (const category of missing) {
    const filters = { location: area, categories: [category] };
    await deps.prisma.huntSchedule.create({
      data: {
        userId: scope.userId,
        teamId: scope.type === 'team' ? scope.teamId : null,
        name: defaultName(filters),
        filters: toJson(filters),
        frequency,
        nextRunAt: now,
      },
    });
  }
  return { created: missing.length, skipped: profile.targetCategories.length - missing.length };
}

