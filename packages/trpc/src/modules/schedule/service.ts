import type { HuntFrequency, HuntSchedule, Prisma, PrismaClient } from '@prisma/client';
import type { QueueManager } from '@repo/jobs';
import { TRPCError } from '@trpc/server';
import huntService from '../lead/hunt/service';
import { readHuntFilters, type HuntFilters } from '../../utils/json';
import { resolveScope, type Scope } from '../../utils/scope';
import { HUNT_SCHEDULES, LimitError, check } from '../forfait/features';
import { limitReached, type PlanMode } from '../forfait/gate';
import { scopeValues } from '../forfait/store';
import { ACTIVE_STATUSES, nextRunAfter } from './cadence';


/** Where schedules come from: the database and the queue runs go to. */
export interface ScheduleDeps {
  prisma: PrismaClient;
  jobs: QueueManager;
}

const notFound = () => new TRPCError({ code: 'NOT_FOUND', message: 'Schedule not found' });

/** The rows of one scope: a team's, or the person's own personal ones. */
export function scheduleFilter(scope: Scope): Prisma.HuntScheduleWhereInput {
  return scope.type === 'team' ? { teamId: scope.teamId } : { userId: scope.userId, teamId: null };
}

/** The scope a stored schedule runs in. */
export function scopeOf(row: { userId: string; teamId: string | null }): Scope {
  return row.teamId ? { type: 'team', teamId: row.teamId, userId: row.userId } : { type: 'personal', userId: row.userId };
}

/** The default name: the place. The UI shows the categories under it. */
export function defaultName(filters: { location: string }): string {
  return filters.location.slice(0, 120);
}

/**
 * Loads one schedule and its scope after checking the caller may use that
 * scope. Someone else's personal schedule, or one outside a declared team,
 * reads as not found.
 */
export async function loadSchedule(
  prisma: PrismaClient,
  userId: string,
  scheduleId: string,
  mode: PlanMode,
  declaredTeamId?: string
): Promise<{ row: HuntSchedule; scope: Scope }> {
  const row = await prisma.huntSchedule.findUnique({ where: { id: scheduleId } });
  if (!row) throw notFound();
  if (row.teamId) {
    if (declaredTeamId && declaredTeamId !== row.teamId) throw notFound();
    return { row, scope: await resolveScope(prisma, userId, row.teamId, mode) };
  }
  if (declaredTeamId || row.userId !== userId) throw notFound();
  return { row, scope: { type: 'personal', userId } };
}

/**
 * Refuses enabling `adding` more schedules when the scope's plan caps active
 * schedules (`glouton.hunt_schedules`) and the cap would be passed. While
 * Glouton fails open there is no cap.
 */
export async function ensureRoom(prisma: PrismaClient, scope: Scope, adding: number): Promise<void> {
  const plan = await scopeValues(prisma, { userId: scope.userId, teamId: scope.type === 'team' ? scope.teamId : null });
  if (!plan.enforced) return;
  const used = await prisma.huntSchedule.count({ where: { ...scheduleFilter(scope), enabled: true } });
  try {
    check(plan.values, HUNT_SCHEDULES, used, adding, plan.upgradeUrl);
  } catch (error) {
    if (error instanceof LimitError) throw limitReached(error);
    throw error;
  }
}

/** True while the schedule's latest run is pending or processing. */
export async function runIsActive(prisma: PrismaClient, row: Pick<HuntSchedule, 'lastSessionId'>): Promise<boolean> {
  if (!row.lastSessionId) return false;
  const session = await prisma.huntSession.findUnique({ where: { id: row.lastSessionId }, select: { status: true } });
  return Boolean(session && ACTIVE_STATUSES.includes(session.status));
}

/**
 * Starts one run of a schedule as a normal hunt session linked to it.
 * Returns null, without starting anything, when the previous run is still
 * going or another caller claimed this run first: the claim is an update
 * conditioned on the `lastRunAt` this caller read, so two ticks or a tick
 * and a "run now" never both start. The next slot keeps the cadence for a
 * due run and restarts it from now for an early one.
 */
export async function startRun(
  deps: ScheduleDeps,
  row: HuntSchedule,
  now: Date,
  delayMs = 0
): Promise<string | null> {
  const { prisma } = deps;
  if (await runIsActive(prisma, row)) return null;
  const base = row.nextRunAt <= now ? row.nextRunAt : now;
  const claimed = await prisma.huntSchedule.updateMany({
    where: { id: row.id, lastRunAt: row.lastRunAt },
    data: { lastRunAt: now, nextRunAt: nextRunAfter(row.frequency, base, now) },
  });
  if (claimed.count === 0) return null;
  const filters = readHuntFilters(row.filters);
  if (!filters?.location || !filters.categories?.length) throw new Error('The schedule has no location or category');
  const started = await huntService.startLocalBusinessHunt({
    scope: scopeOf(row),
    location: filters.location,
    categories: filters.categories,
    hasWebsite: filters.hasWebsite,
    radius: filters.radius,
    maxResults: filters.maxResults,
    jobs: deps.jobs,
    prisma,
    scheduleId: row.id,
    delayMs,
  });
  await prisma.huntSchedule.update({ where: { id: row.id }, data: { lastSessionId: started.huntSessionId } });
  return started.huntSessionId;
}

/** A schedule as the API returns it: typed filters and its latest run. */
export function presentSchedule(
  row: HuntSchedule & { sessions?: Array<{ id: string; status: string; successfulLeads: number; createdAt: Date; completedAt: Date | null; error: string | null }> }
) {
  const { sessions, filters, ...rest } = row;
  return { ...rest, filters: readHuntFilters(filters) as HuntFilters, lastRun: sessions?.[0] ?? null };
}

const lastRun = {
  sessions: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, status: true, successfulLeads: true, createdAt: true, completedAt: true, error: true },
  },
} as const;

/** A scope's schedules, enabled first, then by next run. */
export async function listSchedules(prisma: PrismaClient, scope: Scope) {
  const rows = await prisma.huntSchedule.findMany({
    where: scheduleFilter(scope),
    orderBy: [{ enabled: 'desc' }, { nextRunAt: 'asc' }],
    include: lastRun,
  });
  return rows.map(presentSchedule);
}

/** One schedule as the API returns it, read again after a write. */
export async function reload(prisma: PrismaClient, id: string) {
  return presentSchedule(await prisma.huntSchedule.findUniqueOrThrow({ where: { id }, include: lastRun }));
}

/** Renames a schedule or changes its frequency; a new frequency restarts the cadence from the last run. */
export async function updateSchedule(
  prisma: PrismaClient,
  row: HuntSchedule,
  fields: { frequency?: HuntFrequency; name?: string },
  now = new Date()
) {
  const data: Prisma.HuntScheduleUpdateInput = {};
  if (fields.name) data.name = fields.name;
  if (fields.frequency && fields.frequency !== row.frequency) {
    data.frequency = fields.frequency;
    data.nextRunAt = row.lastRunAt ? nextRunAfter(fields.frequency, row.lastRunAt, now) : now;
  }
  await prisma.huntSchedule.update({ where: { id: row.id }, data });
  return reload(prisma, row.id);
}

/** Stops future runs; a run already going finishes. */
export async function pauseSchedule(prisma: PrismaClient, row: HuntSchedule) {
  await prisma.huntSchedule.update({ where: { id: row.id }, data: { enabled: false, pausedReason: null } });
  return reload(prisma, row.id);
}

/** Enables a paused schedule within the plan limit, clears its failures, and runs it at the next tick when its slot passed. */
export async function resumeSchedule(deps: ScheduleDeps, row: HuntSchedule, scope: Scope, now = new Date()) {
  if (row.enabled) return reload(deps.prisma, row.id);
  await ensureRoom(deps.prisma, scope, 1);
  await deps.prisma.huntSchedule.update({
    where: { id: row.id },
    data: { enabled: true, pausedReason: null, consecutiveFailures: 0, nextRunAt: row.nextRunAt < now ? now : row.nextRunAt },
  });
  return reload(deps.prisma, row.id);
}

/** Starts a run now, or refuses with CONFLICT while the previous run is still going. */
export async function runNow(deps: ScheduleDeps, row: HuntSchedule, now = new Date()) {
  const huntSessionId = await startRun(deps, row, now);
  if (!huntSessionId) throw new TRPCError({ code: 'CONFLICT', message: 'The previous run of this schedule is still going' });
  return { huntSessionId };
}
