import type { HuntFrequency, HuntStatus } from '@prisma/client';

/** How often the hunt-schedules job looks for due schedules. */
export const TICK_MS = 15 * 60 * 1000;

/** Consecutive failed runs after which a schedule pauses itself. */
export const FAILURE_LIMIT = 3;

/** The most runs one tick starts; the rest stay due for the next tick. */
export const MAX_STARTS_PER_TICK = 6;

/** The gap between two runs one tick starts, so OpenStreetMap sees a slow trickle. */
export const PACE_MS = 2 * 60 * 1000;

/** The `pausedReason` of a schedule that paused itself after too many failures. */
export const PAUSED_BY_FAILURES = 'failures';

/** Session statuses that mean a run is still going. */
export const ACTIVE_STATUSES: readonly HuntStatus[] = ['PENDING', 'PROCESSING'];

const MAX_CATCH_UP = 1000;

/** One period after `from`, in UTC. A month keeps the day of month, clamped to the month's last day. */
export function addPeriod(frequency: HuntFrequency, from: Date): Date {
  const next = new Date(from.getTime());
  if (frequency === 'DAILY') {
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
  if (frequency === 'WEEKLY') {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  const day = from.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

/**
 * The first slot strictly after `now` on the cadence that starts at
 * `planned`, so slots missed while the server was down or the schedule was
 * paused are skipped, not replayed one after the other.
 */
export function nextRunAfter(frequency: HuntFrequency, planned: Date, now: Date): Date {
  let next = addPeriod(frequency, planned);
  for (let step = 0; next <= now && step < MAX_CATCH_UP; step++) next = addPeriod(frequency, next);
  return next <= now ? addPeriod(frequency, now) : next;
}

/** True when an enabled schedule's slot has come. */
export function isDue(schedule: { enabled: boolean; nextRunAt: Date }, now: Date): boolean {
  return schedule.enabled && schedule.nextRunAt <= now;
}

/** What a finished run means for its schedule: `null` while it still runs. A cancelled run counts neither way. */
export type RunOutcome = 'success' | 'failure' | 'neutral';

/** The outcome of a run from its session status. */
export function outcomeOf(status: HuntStatus): RunOutcome | null {
  if (status === 'COMPLETED') return 'success';
  if (status === 'FAILED') return 'failure';
  if (status === 'CANCELLED') return 'neutral';
  return null;
}

/** The failure count after a run, and whether the schedule must pause itself. */
export function afterRun(failures: number, outcome: RunOutcome): { consecutiveFailures: number; pause: boolean } {
  if (outcome === 'success') return { consecutiveFailures: 0, pause: false };
  if (outcome === 'neutral') return { consecutiveFailures: failures, pause: false };
  const consecutiveFailures = failures + 1;
  return { consecutiveFailures, pause: consecutiveFailures >= FAILURE_LIMIT };
}
