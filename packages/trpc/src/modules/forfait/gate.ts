import { TRPCError } from '@trpc/server';
import type { ForfaitReader, ScopeVerdict } from './store';

/**
 * The access policy for every tRPC procedure. It is default-deny: every
 * procedure is gated unless its path is in `EXEMPT` or `ACCOUNT`, so a new
 * procedure is gated the day it is added.
 *
 * The scope of a call is decided on the input as the procedure parses it,
 * never on the raw request, so a `teamId` the procedure does not declare is
 * ignored.
 *
 * - A procedure that loads one row by id declares `meta.forfait.row`: the
 *   gate loads that row and the call takes the row's scope (its team, after a
 *   membership check, or its owner's personal scope). A missing row passes
 *   through so the procedure answers its own NOT_FOUND.
 * - Otherwise a declared `teamId` makes a team call: membership is checked
 *   server side (a forged id is refused), then the team's access.
 * - Otherwise the call is personal and needs the person's own access, except
 *   for the `CROSS_SCOPE` procedures, which read across every scope through
 *   `accessForUser` and need one entitled scope; `accessForUser` then hides
 *   the scopes without access.
 * - A procedure whose input names a row id (`id`, `leadId`, `ids`...) must
 *   say how that id is scoped (`row`, or `ids: 'scoped' | 'unscoped'`), or it
 *   is refused, so a new by-id procedure cannot skip the row check.
 * - A procedure whose input is not an object schema the gate can read
 *   (union, intersection, array, primitive) is refused unless cross-scope:
 *   the gate fails closed rather than guess its scope.
 */

/** Procedures that work without a plan or a session: sign-in, the session itself, the scope switcher and the paywall. */
export const EXEMPT: ReadonlySet<string> = new Set([
  'auth.login',
  'auth.me',
  'auth.logout',
  'user.me',
  'team.list',
  'team.directory',
  'forfait.status',
]);

/** Procedures about the signed-in person's own account: they need a session but no plan. */
export const ACCOUNT: ReadonlySet<string> = new Set([
  'user.updateProfile',
  'user.changePassword',
  'user.deleteOwnAccount',
  'user.getSmtpConfig',
  'user.updateSmtpConfig',
  'user.testSmtpConfig',
]);

/** Path prefixes and paths whose teamId-less calls span every scope the caller may use. */
export const CROSS_SCOPE: readonly string[] = [
  'inbox.',
  'contact.',
  'ardoise.',
  'assistant.write',
  'assistant.nextAction',
  'opportunity.',
  'companyCreation.list',
  'companyCreation.get',
  'companyCreation.stats',
  'companyCreation.triggerScrape',
  'email.sendDraft',
  'email.getTemplates',
  'email.previewEmail',
  'user.getConfiguredSources',
];

/** The tables a by-id procedure can name as its row. Each has `userId` and `teamId`. */
export type RowModel = 'lead' | 'huntSession' | 'auditSession';

/** How a procedure tells the gate where its scope comes from. */
export interface ForfaitMeta {
  forfait?: {
    /** The procedure acts on this row: the gate loads it by `input[key]` and uses its scope. */
    row?: { model: RowModel; key: string };
    /**
     * The procedure's ids are not scope-owned rows (`unscoped`: catalog
     * entries, users for admins), or are only looked up inside the declared
     * scope (`scoped`).
     */
    ids?: 'scoped' | 'unscoped';
  };
}

/** The owner and team of one row, or null when it does not exist. */
export type RowLoader = (model: RowModel, id: string) => Promise<{ userId: string; teamId: string | null } | null>;

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

const ID_KEY = /^ids?$|[a-z](Id|Ids)$/;

/** True for an input key that names a row: `id`, `ids`, `leadId`, `leadIds`..., but not `teamId`. */
export function isIdKey(key: string): boolean {
  return key !== 'teamId' && ID_KEY.test(key);
}

/** The team a parsed input names, or null for personal; anything but a non-empty string is personal. */
export function teamIdOf(input: unknown): string | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return null;
  const teamId = (input as Record<string, unknown>).teamId;
  return typeof teamId === 'string' && teamId.length > 0 ? teamId : null;
}

/** Throws unless the verdict allows the call. */
function ensure(verdict: ScopeVerdict): void {
  if (!verdict.allowed) throw planRequired(verdict.upgradeUrl);
}

const notFound = () => new TRPCError({ code: 'NOT_FOUND', message: 'Not found' });

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
 * Checks a call on one row against the row's own scope. A declared `teamId`
 * that is not the row's team, or a personal row of someone else, reads as
 * not found so the row's existence does not leak.
 */
export async function requireRow(
  reader: ForfaitReader,
  userId: string,
  row: { userId: string; teamId: string | null },
  declaredTeamId: string | null
): Promise<void> {
  if (row.teamId) {
    if (declaredTeamId && declaredTeamId !== row.teamId) throw notFound();
    return requireTeam(reader, userId, row.teamId);
  }
  if (declaredTeamId || row.userId !== userId) throw notFound();
  return requirePersonal(reader, userId);
}

/** One call as the gate sees it. `input` is the procedure's parsed input, or undefined when it has none. */
export interface GateCall {
  path: string;
  userId: string | null;
  input: unknown;
  idKeys: readonly string[];
  /** False when the procedure's input schema cannot be read; such a procedure is refused unless cross-scope. */
  readable?: boolean;
  meta: ForfaitMeta | undefined;
  loadRow: RowLoader;
}

/** Decides one call. `userId` is null for an unauthenticated caller, who only gets through exempt procedures. */
export async function authorize(reader: ForfaitReader, call: GateCall): Promise<void> {
  if (EXEMPT.has(call.path)) return;
  if (!call.userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please log in.' });
  if (ACCOUNT.has(call.path)) return;
  const declared = teamIdOf(call.input);
  const rule = call.meta?.forfait;

  if (rule?.row) {
    const id = (call.input as Record<string, unknown> | undefined)?.[rule.row.key];
    if (typeof id !== 'string' || !id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Missing id' });
    const row = await call.loadRow(rule.row.model, id);
    if (!row) return;
    return requireRow(reader, call.userId, row, declared);
  }

  const crossScope = isCrossScope(call.path);
  if (call.readable === false && !crossScope) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Procedure ${call.path} has an input the plan gate cannot read` });
  }
  if (call.idKeys.length > 0 && !rule?.ids && !crossScope) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Procedure ${call.path} does not declare how its ids are scoped` });
  }
  if (declared) return requireTeam(reader, call.userId, declared);
  if (!crossScope) return requirePersonal(reader, call.userId);
  const scopes = await reader.entitledScopes(call.userId);
  if (scopes.personal || scopes.teamIds.length > 0) return;
  ensure(await reader.personal(call.userId));
}
