import type { CompetitorSuggestion, Prisma, PrismaClient } from '@prisma/client';
import type { QueueManager } from '@repo/jobs';
import { TRPCError } from '@trpc/server';
import type { Scope } from '../../utils/scope';
import { domainOf } from '../competitor/rules';
import { present as presentProfile, profileFor, scopeKey, searchProfile } from '../prospect/profile';
import { WEEK_MS, scopeOfRow, scopeWhere } from './engine';
import { searchable } from './sources';
import { evidenceOf, type ScoreParts } from './rules';

/** The queue a discovery run goes to, and the queue of the hourly scan that starts weekly runs. */
export const DISCOVERY_QUEUE = 'competitor-discovery';
export const DISCOVERY_TICK_QUEUE = 'competitor-discovery-tick';
/** How often the scan looks for spaces whose weekly run is due. */
export const DISCOVERY_TICK_MS = 60 * 60 * 1000;
/** The most weekly runs one scan starts, and the gap between them, so OpenStreetMap and sonar see a trickle. */
export const MAX_RUNS_PER_TICK = 6;
export const RUN_PACE_MS = 3 * 60 * 1000;
/** A queued or running run older than this is treated as lost, so a new one may start. */
export const STALE_RUN_MS = 30 * 60 * 1000;
/** The most suggestions "accept all above" takes in one call. */
export const MAX_BULK_ACCEPT = 50;

const notFound = () => new TRPCError({ code: 'NOT_FOUND', message: 'Suggestion not found' });

/** The job data of one discovery run. */
export interface DiscoveryJob {
  userId: string;
  teamId: string | null;
  trigger: 'manual' | 'weekly';
}

type Jobs = Pick<QueueManager, 'addJob'>;

function busy(state: { status: string | null; queuedAt: Date | null } | null, now: Date): boolean {
  if (!state || (state.status !== 'queued' && state.status !== 'running')) return false;
  return Boolean(state.queuedAt && now.getTime() - state.queuedAt.getTime() < STALE_RUN_MS);
}

/** The run status to show: a queued or running run that went stale reads as failed. */
function runStatus(state: { status: string | null; queuedAt: Date | null }, now: Date): string | null {
  if (state.status !== 'queued' && state.status !== 'running') return state.status;
  return busy(state, now) ? state.status : 'failed';
}

/** The part of a stored run result the queue shows. */
export interface LastRun {
  status: string | null;
  created: number;
  quotaExhausted: boolean;
}

function lastResultOf(value: Prisma.JsonValue | null): LastRun | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { status, created, quotaExhausted } = value as Record<string, unknown>;
  return { status: typeof status === 'string' ? status : null, created: typeof created === 'number' ? created : 0, quotaExhausted: quotaExhausted === true };
}

/** A suggestion as the queue shows it. */
export function present(row: CompetitorSuggestion) {
  return { ...row, evidence: evidenceOf(row.evidence), scoreParts: row.scoreParts as unknown as ScoreParts };
}

/** The scope's pending suggestions, best first, with the last run and whether the profile lets discovery search. */
export async function listSuggestions(prisma: PrismaClient, scope: Scope, status: 'PENDING' | 'REJECTED' = 'PENDING') {
  const [rows, state, profile] = await Promise.all([
    prisma.competitorSuggestion.findMany({
      where: { ...scopeWhere(scope), status },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    }),
    prisma.competitorDiscoveryState.findUnique({ where: { scopeKey: scopeKey(scope) } }),
    profileFor(prisma, scope),
  ]);
  return {
    items: rows.map(present),
    run: state ? { status: runStatus(state, new Date()), lastRunAt: state.lastRunAt, nextRunAt: state.nextRunAt, lastResult: lastResultOf(state.lastResult) } : null,
    profileReady: searchable(searchProfile(profile, 'competitors')),
  };
}

/** Pending suggestions of a scope, and how many of them nobody has looked at yet. */
export async function suggestionCounts(prisma: PrismaClient, scope: Scope) {
  const where = { ...scopeWhere(scope), status: 'PENDING' as const };
  const [pending, fresh] = await Promise.all([
    prisma.competitorSuggestion.count({ where }),
    prisma.competitorSuggestion.count({ where: { ...where, seenAt: null } }),
  ]);
  return { pending, fresh };
}

/** Marks every pending suggestion of the scope as seen, which clears the "Nouveaux" badge. */
export async function markSeen(prisma: PrismaClient, scope: Scope, now = new Date()) {
  const result = await prisma.competitorSuggestion.updateMany({ where: { ...scopeWhere(scope), status: 'PENDING', seenAt: null }, data: { seenAt: now } });
  return { updated: result.count };
}

/**
 * Queues a discovery run for the scope now. Refused when the profile gives
 * nothing to search with; a no-op while a run is already queued or running.
 */
export async function requestRun(prisma: PrismaClient, jobs: Jobs, scope: Scope, now = new Date()) {
  if (!searchable(searchProfile(await profileFor(prisma, scope), 'competitors'))) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'profile_empty' });
  }
  const key = scopeKey(scope);
  const state = await prisma.competitorDiscoveryState.findUnique({ where: { scopeKey: key } });
  if (busy(state, now)) return { queued: false };
  const teamId = scope.type === 'team' ? scope.teamId : null;
  await prisma.competitorDiscoveryState.upsert({
    where: { scopeKey: key },
    create: { scopeKey: key, userId: scope.userId, teamId, status: 'queued', queuedAt: now },
    update: { status: 'queued', queuedAt: now },
  });
  const job: DiscoveryJob = { userId: scope.userId, teamId, trigger: 'manual' };
  await jobs.addJob(DISCOVERY_QUEUE, DISCOVERY_QUEUE, job, { removeOnComplete: 20, removeOnFail: 20 });
  return { queued: true };
}

async function loadOne(prisma: Prisma.TransactionClient, scope: Scope, suggestionId: string) {
  const row = await prisma.competitorSuggestion.findFirst({ where: { id: suggestionId, ...scopeWhere(scope) } });
  if (!row) throw notFound();
  return row;
}

function notesOf(row: CompetitorSuggestion): string | null {
  const lines = evidenceOf(row.evidence).map((entry) => [entry.snippet, entry.url].filter(Boolean).join(' '));
  return lines.length > 0 ? lines.join('\n').slice(0, 10_000) : null;
}

/**
 * Accepts a pending suggestion: creates a competitor in the scope from its
 * name, website, area and evidence (as notes), or links the competitor that
 * already has its domain. Accepting twice is refused.
 */
export async function acceptSuggestion(prisma: PrismaClient, scope: Scope, suggestionId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const row = await loadOne(tx, scope, suggestionId);
    const claimed = await tx.competitorSuggestion.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'ACCEPTED', decidedAt: now } });
    if (claimed.count === 0) throw new TRPCError({ code: 'CONFLICT', message: 'Suggestion already decided' });
    const teamId = scope.type === 'team' ? scope.teamId : null;
    const domain = domainOf(row.website) ?? row.domain;
    const twin = domain
      ? await tx.competitor.findFirst({ where: { domain, ...(teamId ? { teamId } : { userId: scope.userId, teamId: null }) }, select: { id: true } })
      : null;
    const competitor =
      twin ??
      (await tx.competitor.create({
        data: { userId: scope.userId, teamId, name: row.name, website: row.website, domain, area: row.area, notes: notesOf(row) },
        select: { id: true },
      }));
    await tx.competitorSuggestion.update({ where: { id: row.id }, data: { competitorId: competitor.id } });
    return { suggestionId: row.id, competitorId: competitor.id, created: !twin };
  });
}

/** Rejects a pending suggestion. It stays stored so discovery never suggests that domain or SIREN again. */
export async function rejectSuggestion(prisma: PrismaClient, scope: Scope, suggestionId: string, now = new Date()) {
  const row = await loadOne(prisma, scope, suggestionId);
  const result = await prisma.competitorSuggestion.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'REJECTED', decidedAt: now } });
  if (result.count === 0) throw new TRPCError({ code: 'CONFLICT', message: 'Suggestion already decided' });
  return { suggestionId: row.id };
}

/** Puts a rejected suggestion back in the queue. */
export async function restoreSuggestion(prisma: PrismaClient, scope: Scope, suggestionId: string) {
  const row = await loadOne(prisma, scope, suggestionId);
  const result = await prisma.competitorSuggestion.updateMany({ where: { id: row.id, status: 'REJECTED' }, data: { status: 'PENDING', decidedAt: null } });
  if (result.count === 0) throw new TRPCError({ code: 'CONFLICT', message: 'Suggestion is not rejected' });
  return { suggestionId: row.id };
}

/** Accepts every pending suggestion scoring at least `minScore`, best first, up to MAX_BULK_ACCEPT. */
export async function acceptAbove(prisma: PrismaClient, scope: Scope, minScore: number) {
  const rows = await prisma.competitorSuggestion.findMany({
    where: { ...scopeWhere(scope), status: 'PENDING', score: { gte: minScore } },
    orderBy: { score: 'desc' },
    take: MAX_BULK_ACCEPT,
    select: { id: true },
  });
  let accepted = 0;
  for (const row of rows) {
    try {
      await acceptSuggestion(prisma, scope, row.id);
      accepted++;
    } catch (error) {
      if (!(error instanceof TRPCError && error.code === 'CONFLICT')) throw error;
    }
  }
  return { accepted };
}

/** What the scan needs: the database, the queue, the plan gate, the clock. */
export interface TickDeps {
  prisma: PrismaClient;
  jobs: Jobs;
  allowed: (scope: { userId: string; teamId: string | null }) => Promise<boolean>;
  now?: () => Date;
}

/**
 * The hourly scan behind the weekly runs: every profile that can search and
 * whose space has a plan gets one run a week. A profile never run is due at
 * once. The slot is claimed with an update on the `nextRunAt` value read, so
 * two scans never queue the same space twice. At most MAX_RUNS_PER_TICK runs
 * are queued, RUN_PACE_MS apart.
 */
export async function tick(deps: TickDeps): Promise<{ queued: number; skipped: number }> {
  const { prisma } = deps;
  const now = deps.now?.() ?? new Date();
  const result = { queued: 0, skipped: 0 };
  const [profiles, states] = await Promise.all([
    prisma.teamProspectProfile.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.competitorDiscoveryState.findMany(),
  ]);
  const byKey = new Map(states.map((state) => [state.scopeKey, state]));
  for (const row of profiles) {
    if (result.queued >= MAX_RUNS_PER_TICK) break;
    const state = byKey.get(row.scopeKey) ?? null;
    if (state?.nextRunAt && state.nextRunAt > now) continue;
    if (busy(state, now)) continue;
    const scope = scopeOfRow(row);
    const profile = presentProfile(row);
    if (!profile.usages.includes('competitors') || !searchable(searchProfile(profile, 'competitors'))) continue;
    if (!(await deps.allowed({ userId: row.userId, teamId: row.teamId }))) {
      result.skipped++;
      await prisma.competitorDiscoveryState.upsert({
        where: { scopeKey: row.scopeKey },
        create: { scopeKey: row.scopeKey, userId: row.userId, teamId: row.teamId, nextRunAt: new Date(now.getTime() + WEEK_MS) },
        update: { nextRunAt: new Date(now.getTime() + WEEK_MS) },
      });
      continue;
    }
    const slot = { status: 'queued', queuedAt: now, nextRunAt: new Date(now.getTime() + WEEK_MS) };
    if (state) {
      const claimed = await prisma.competitorDiscoveryState.updateMany({ where: { id: state.id, nextRunAt: state.nextRunAt }, data: slot });
      if (claimed.count === 0) continue;
    } else {
      try {
        await prisma.competitorDiscoveryState.create({ data: { ...slot, scopeKey: row.scopeKey, userId: row.userId, teamId: row.teamId } });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') continue;
        throw error;
      }
    }
    const job: DiscoveryJob = { userId: row.userId, teamId: row.teamId, trigger: 'weekly' };
    await deps.jobs.addJob(DISCOVERY_QUEUE, DISCOVERY_QUEUE, job, { delay: result.queued * RUN_PACE_MS, removeOnComplete: 20, removeOnFail: 20 });
    result.queued++;
  }
  return result;
}
