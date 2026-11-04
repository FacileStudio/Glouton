import { TRPCError } from '@trpc/server';
import type { ForfaitReader, ScopeVerdict } from './store';

/**
 * The access policy for every tRPC procedure. It is default-deny: a
 * procedure is gated unless its path is in `EXEMPT`, so a new procedure is
 * gated the day it is added.
 *
 * - A call carrying a `teamId` is a team call: the server checks the caller
 *   is a member (a forged id is refused) and that the team's space has
 *   `glouton.access`.
 * - A call without one is a personal call and needs the person's own
 *   `glouton.access`, except for the `CROSS_SCOPE` procedures, which read
 *   across every scope through `accessForUser` and only need one entitled
 *   scope; `accessForUser` then hides the scopes without access.
 */

/** Procedures that work without a plan: sign-in, the session, the scope switcher and the paywall itself. */
export const EXEMPT: ReadonlySet<string> = new Set([
  'auth.login',
  'auth.register',
  'auth.me',
  'auth.logout',
  'user.me',
  'user.deleteOwnAccount',
  'team.list',
  'team.directory',
  'forfait.status',
]);

/** Path prefixes and paths whose teamId-less calls span every scope the caller may use. */
export const CROSS_SCOPE: readonly string[] = [
  'inbox.',
  'contact.',
  'ardoise.',
  'opportunity.',
  'companyCreation.',
  'email.sendDraft',
];

/** The message every refused call carries; the paywall explains the rest. */
export const PAYWALL_MESSAGE = 'Glouton is part of the Pro and Studio plans.';

/** Carries the upgrade URL from a refusal to the error formatter. */
export class PlanRequiredError extends Error {
  constructor(readonly upgradeUrl: string) {
    super(PAYWALL_MESSAGE);
    this.name = 'PlanRequiredError';
  }
}

/** The typed refusal: HTTP 402, with `data.upgrade_url` added by the error formatter. */
export function planRequired(upgradeUrl: string): TRPCError {
  return new TRPCError({ code: 'PAYMENT_REQUIRED', message: PAYWALL_MESSAGE, cause: new PlanRequiredError(upgradeUrl) });
}

/** The upgrade URL of a refusal, or undefined for any other error. */
export function upgradeUrlOf(error: { cause?: unknown }): string | undefined {
  return error.cause instanceof PlanRequiredError ? error.cause.upgradeUrl : undefined;
}

/** True when the path is one of the cross-scope procedures. */
export function isCrossScope(path: string): boolean {
  return CROSS_SCOPE.some((entry) => (entry.endsWith('.') ? path.startsWith(entry) : path === entry));
}

/** The team a raw input names, or null for personal; anything but a non-empty string is personal. */
export function teamIdOf(rawInput: unknown): string | null {
  if (rawInput === null || typeof rawInput !== 'object' || Array.isArray(rawInput)) return null;
  const teamId = (rawInput as Record<string, unknown>).teamId;
  return typeof teamId === 'string' && teamId.length > 0 ? teamId : null;
}

/** Throws unless the verdict allows the call. */
function ensure(verdict: ScopeVerdict): void {
  if (!verdict.allowed) throw planRequired(verdict.upgradeUrl);
}

/** Throws FORBIDDEN for a team the user does not belong to, PAYMENT_REQUIRED for a team without access. */
export async function requireTeam(reader: ForfaitReader, userId: string, teamId: string): Promise<void> {
  const verdict = await reader.team(userId, teamId);
  if (!verdict) throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this team' });
  ensure(verdict);
}

/** Throws PAYMENT_REQUIRED unless the personal scope has access. */
export async function requirePersonal(reader: ForfaitReader, userId: string): Promise<void> {
  ensure(await reader.personal(userId));
}

/**
 * Decides one call. `userId` is null for an unauthenticated caller, who only
 * gets through exempt procedures.
 */
export async function authorize(
  reader: ForfaitReader,
  call: { path: string; userId: string | null; rawInput: unknown }
): Promise<void> {
  if (EXEMPT.has(call.path)) return;
  if (!call.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please log in.' });
  const teamId = teamIdOf(call.rawInput);
  if (teamId) return requireTeam(reader, call.userId, teamId);
  if (!isCrossScope(call.path)) return requirePersonal(reader, call.userId);
  const scopes = await reader.entitledScopes(call.userId);
  if (scopes.personal || scopes.teamIds.length > 0) return;
  ensure(await reader.personal(call.userId));
}
