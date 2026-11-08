import type { HuntSchedule, PrismaClient } from '@prisma/client';
import type { QueueManager } from '@repo/jobs';
import { logger } from '@repo/logger';
import { dispatchWebhookEvent, type WebhookEvent } from '@repo/webhooks';
import { MAX_STARTS_PER_TICK, PACE_MS, PAUSED_BY_FAILURES, afterRun, nextRunAfter, outcomeOf } from './cadence';
import { runIsActive, startRun } from './service';

/** The queue and job name of the scan that starts due schedules. */
export const SCHEDULE_QUEUE = 'hunt-schedules';

type Notify = (
  scope: { type: 'personal' | 'team'; userId: string; teamId?: string | null },
  type: string,
  data: Record<string, unknown>
) => Promise<void>;

/** What the background runs need. `allowed` is the forfait job gate; `dispatch` sends team webhooks (Antenne). */
export interface RunnerDeps {
  prisma: PrismaClient;
  jobs: QueueManager;
  allowed: (scope: { userId: string; teamId: string | null }) => Promise<boolean>;
  notify: Notify;
  dispatch?: (options: { event: WebhookEvent; teamId: string; data: Record<string, unknown> }) => Promise<void>;
  now?: () => Date;
}

/** What one tick did, for the job log. */
export interface TickResult {
  settled: number;
  started: number;
  busy: number;
  skipped: number;
  failed: number;
}

function scopeFor(row: { userId: string; teamId: string | null }) {
  return row.teamId ? { type: 'team' as const, userId: row.userId, teamId: row.teamId } : { type: 'personal' as const, userId: row.userId };
}

async function alert(deps: RunnerDeps, row: HuntSchedule, event: WebhookEvent, data: Record<string, unknown>) {
  await deps.notify(scopeFor(row), event === 'hunt.digest' ? 'hunt-digest' : 'hunt-schedule-paused', data).catch(() => {});
  if (!row.teamId) return;
  await (deps.dispatch ?? dispatchWebhookEvent)({ event, teamId: row.teamId, data }).catch(() => {});
}

/**
 * Applies a finished run to its schedule, once: a success resets the failure
 * count and, when it found new leads, sends the digest in the app and to the
 * team's webhooks; a failure adds one and pauses the schedule at the third
 * in a row, with a notice; a cancelled run changes nothing. Only the
 * schedule's latest run is settled, and the claim on `lastSettledSessionId`
 * makes a second call a no-op. Returns false when there was nothing to do.
 */
export async function settleSession(deps: RunnerDeps, sessionId: string): Promise<boolean> {
  const { prisma } = deps;
  const session = await prisma.huntSession.findUnique({
    where: { id: sessionId },
    select: { id: true, scheduleId: true, status: true, successfulLeads: true, error: true },
  });
  const outcome = session?.scheduleId ? outcomeOf(session.status) : null;
  if (!session?.scheduleId || !outcome) return false;
  const row = await prisma.huntSchedule.findUnique({ where: { id: session.scheduleId } });
  if (!row || row.lastSessionId !== session.id) return false;
  const next = afterRun(row.consecutiveFailures, outcome);
  const claimed = await prisma.huntSchedule.updateMany({
    where: {
      id: row.id,
      lastSessionId: session.id,
      OR: [{ lastSettledSessionId: null }, { lastSettledSessionId: { not: session.id } }],
    },
    data: {
      lastSettledSessionId: session.id,
      consecutiveFailures: next.consecutiveFailures,
      ...(outcome === 'neutral' ? {} : { lastNewLeads: outcome === 'success' ? session.successfulLeads : 0 }),
      ...(next.pause ? { enabled: false, pausedReason: PAUSED_BY_FAILURES } : {}),
    },
  });
  if (claimed.count === 0) return false;
  const base = { scheduleId: row.id, name: row.name, huntSessionId: session.id };
  if (outcome === 'success' && session.successfulLeads > 0) {
    await alert(deps, row, 'hunt.digest', { ...base, newLeads: session.successfulLeads });
  }
  if (next.pause && row.enabled) {
    await alert(deps, row, 'hunt.schedule_paused', { ...base, failures: next.consecutiveFailures, error: session.error });
  }
  return true;
}

async function recordStartFailure(deps: RunnerDeps, row: HuntSchedule, error: unknown) {
  const next = afterRun(row.consecutiveFailures, 'failure');
  await deps.prisma.huntSchedule.update({
    where: { id: row.id },
    data: { consecutiveFailures: next.consecutiveFailures, ...(next.pause ? { enabled: false, pausedReason: PAUSED_BY_FAILURES } : {}) },
  });
  const message = error instanceof Error ? error.message : String(error);
  logger.error({ scheduleId: row.id, err: message }, '[SCHEDULES] Could not start a scheduled hunt');
  if (next.pause) await alert(deps, row, 'hunt.schedule_paused', { scheduleId: row.id, name: row.name, failures: next.consecutiveFailures, error: message });
}

/**
 * One scan: settles finished runs the hunt worker did not settle (a crash,
 * a stalled session), then starts the schedules whose slot has come, oldest
 * slot first. A schedule whose previous run is still going is left due for a
 * later tick; a scope without a Glouton plan has its slot skipped without
 * counting a failure. At most MAX_STARTS_PER_TICK runs start, PACE_MS apart.
 */
export async function tick(deps: RunnerDeps): Promise<TickResult> {
  const { prisma } = deps;
  const now = deps.now?.() ?? new Date();
  const result: TickResult = { settled: 0, started: 0, busy: 0, skipped: 0, failed: 0 };
  const unsettled = await prisma.huntSchedule.findMany({
    where: { lastSessionId: { not: null } },
    select: { lastSessionId: true, lastSettledSessionId: true },
  });
  for (const row of unsettled) {
    if (row.lastSessionId === row.lastSettledSessionId) continue;
    if (await settleSession(deps, row.lastSessionId!)) result.settled++;
  }
  const due = await prisma.huntSchedule.findMany({
    where: { enabled: true, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: 'asc' },
    take: MAX_STARTS_PER_TICK * 4,
  });
  for (const row of due) {
    if (result.started >= MAX_STARTS_PER_TICK) break;
    if (await runIsActive(prisma, row)) {
      result.busy++;
      continue;
    }
    if (!(await deps.allowed({ userId: row.userId, teamId: row.teamId }))) {
      await prisma.huntSchedule.updateMany({
        where: { id: row.id, nextRunAt: row.nextRunAt },
        data: { nextRunAt: nextRunAfter(row.frequency, row.nextRunAt, now) },
      });
      result.skipped++;
      continue;
    }
    try {
      const started = await startRun(deps, row, now, result.started * PACE_MS);
      if (started) result.started++;
      else result.busy++;
    } catch (error) {
      await recordStartFailure(deps, row, error);
      result.failed++;
    }
  }
  return result;
}
