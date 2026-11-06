import type { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '@repo/logger';
import { GLOUTON_ACCESS, enabled, sanitize, upgradeUrl } from './features';

/**
 * Glouton keeps the entitlements of every scope in its own database: on the
 * `Team` row for a shared space, in `PersonEntitlement` (by Registre `sub`)
 * for personal work, and a singleton `ForfaitState` row recording that a
 * snapshot with a non-zero `entitlements_revision` was applied, with the
 * highest revision and version seen. A person with several Registre
 * identities gets the values of the most recent identity that the snapshot
 * lists in `people[]` (ties broken by `sub`), like Courrier, so a recreated
 * account is not shadowed by its dead predecessor. Reading the database on
 * every check, instead of an in-memory store, means a restart while Registre
 * is down keeps the last known values and never reopens fail-open.
 */

/** The verdict for one scope. `enforced` is false while Glouton fails open. */
export interface ScopeVerdict {
  allowed: boolean;
  enforced: boolean;
  upgradeUrl: string;
}

/** The scopes a person may use now, for cross-scope reads. */
export interface EntitledScopes {
  personal: boolean;
  teamIds: string[];
}

/** Every entitlement read Glouton makes, so tests can swap the database out. */
export interface ForfaitReader {
  /** The verdict for a team scope, or null when the user is not a member of that team. */
  team(userId: string, teamId: string): Promise<ScopeVerdict | null>;
  /** The verdict for the user's personal scope. */
  personal(userId: string): Promise<ScopeVerdict>;
  /** The personal flag and team ids this user may work in. */
  entitledScopes(userId: string): Promise<EntitledScopes>;
}

/** The snapshot fields Glouton reads entitlements from. */
export interface EntitlementSnapshot {
  version: number;
  entitlements_revision?: number;
  spaces: Array<{ id: string; entitlements?: Record<string, unknown> }>;
  people?: Array<{ sub: string; entitlements?: Record<string, unknown> }>;
}

/** The advisory lock key that serialises entitlement applies across processes. */
export const FORFAIT_LOCK = 7_243_117_001;

/** What `applyEntitlements` did with a snapshot. */
export type ApplyOutcome = 'applied' | 'reset' | 'not-pushed' | 'stale';

let warnedOpen = false;

/** Logs the fail-open warning once per process instead of once per call. */
function warnOpen(): void {
  if (warnedOpen) return;
  warnedOpen = true;
  logger.warn('[FORFAIT] No entitlements snapshot applied yet: Glouton allows every scope until Registre sends one');
}

/** The snapshot's entitlements revision, or 0 when Registre has applied no push yet or sent garbage. */
export function revisionOf(snapshot: EntitlementSnapshot): number {
  const revision = snapshot.entitlements_revision;
  return typeof revision === 'number' && Number.isSafeInteger(revision) && revision > 0 ? revision : 0;
}

/**
 * Stores the snapshot's entitlements inside the Apply transaction, holding a
 * transaction-scoped advisory lock so two applies (two replicas, or a nudge
 * racing the timer) never interleave their stale checks and writes.
 * `entitlements_revision` is the only signal: while it is 0 or absent nothing
 * changes (fail-open before the first push, last known values after it). A
 * snapshot from another issuer, or whose version went back (Registre was
 * restored or replaced), is logged as an error and becomes the new baseline:
 * the marks are reset and enforcement stays on. Otherwise a snapshot whose
 * revision is lower than the last applied one is stale and ignored. An
 * applied snapshot is the whole truth: every linked
 * team gets its space's values (none means the feature defaults, so no
 * access) and people missing from it lose theirs.
 */
export async function applyEntitlements(
  tx: Prisma.TransactionClient,
  snapshot: EntitlementSnapshot,
  issuer: string
): Promise<ApplyOutcome> {
  const revision = revisionOf(snapshot);
  if (revision === 0) return 'not-pushed';
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${FORFAIT_LOCK})`);
  const last = await tx.forfaitState.findUnique({
    where: { id: 1 },
    select: { issuer: true, version: true, revision: true },
  });
  const reset = Boolean(last && (last.issuer !== issuer || BigInt(snapshot.version) < last.version));
  if (reset) {
    logger.error(
      { issuer, lastIssuer: last!.issuer, version: snapshot.version, lastVersion: String(last!.version) },
      '[FORFAIT] Registre issuer changed or its directory version went back: resetting the entitlement marks, enforcement stays on'
    );
  } else if (last && BigInt(revision) < last.revision) {
    return 'stale';
  }
  const bySpace = new Map(snapshot.spaces.map((space) => [space.id, sanitize(space.entitlements) ?? {}]));
  const linked = await tx.team.findMany({ where: { registreSpaceId: { not: null } }, select: { id: true, registreSpaceId: true } });
  for (const team of linked) {
    const values = bySpace.get(team.registreSpaceId!) ?? {};
    await tx.team.update({ where: { id: team.id }, data: { entitlements: values as Prisma.InputJsonObject } });
  }
  const people = new Map<string, Record<string, unknown>>();
  for (const person of snapshot.people ?? []) {
    if (typeof person.sub === 'string' && person.sub) people.set(person.sub, sanitize(person.entitlements) ?? {});
  }
  await tx.personEntitlement.deleteMany({ where: { sub: { notIn: Array.from(people.keys()) } } });
  for (const [sub, values] of Array.from(people.entries())) {
    const entitlements = values as Prisma.InputJsonObject;
    await tx.personEntitlement.upsert({ where: { sub }, create: { sub, entitlements }, update: { entitlements } });
  }
  const now = new Date();
  const marks = { issuer, version: BigInt(snapshot.version), revision: BigInt(revision), lastAppliedAt: now };
  await tx.forfaitState.upsert({
    where: { id: 1 },
    create: { id: 1, ...marks, firstAppliedAt: now },
    update: marks,
  });
  return reset ? 'reset' : 'applied';
}

/** The database-backed reader every request and job uses. */
export function dbForfait(prisma: PrismaClient, fallbackIssuer = process.env.OIDC_ISSUER ?? ''): ForfaitReader {
  const state = () => prisma.forfaitState.findUnique({ where: { id: 1 }, select: { issuer: true } });

  const personalValues = async (issuer: string, userId: string) => {
    const accounts = await prisma.account.findMany({
      where: { userId, providerId: issuer },
      orderBy: [{ createdAt: 'desc' }, { accountId: 'asc' }],
      select: { accountId: true },
    });
    if (accounts.length === 0) return null;
    const rows = await prisma.personEntitlement.findMany({
      where: { sub: { in: accounts.map((account) => account.accountId) } },
      select: { sub: true, entitlements: true },
    });
    const bySub = new Map(rows.map((row) => [row.sub, row.entitlements]));
    const chosen = accounts.find((account) => bySub.has(account.accountId));
    return chosen ? bySub.get(chosen.accountId)! : null;
  };

  return {
    async team(userId, teamId) {
      const membership = await prisma.teamMember.findFirst({
        where: { teamId, userId },
        select: { team: { select: { registreSpaceId: true, entitlements: true } } },
      });
      if (!membership) return null;
      const current = await state();
      const url = upgradeUrl(current?.issuer ?? fallbackIssuer, membership.team.registreSpaceId);
      if (!current) {
        warnOpen();
        return { allowed: true, enforced: false, upgradeUrl: url };
      }
      return { allowed: enabled(membership.team.entitlements, GLOUTON_ACCESS), enforced: true, upgradeUrl: url };
    },

    async personal(userId) {
      const current = await state();
      const url = upgradeUrl(current?.issuer ?? fallbackIssuer, null);
      if (!current) {
        warnOpen();
        return { allowed: true, enforced: false, upgradeUrl: url };
      }
      const values = await personalValues(current.issuer, userId);
      return { allowed: enabled(values, GLOUTON_ACCESS), enforced: true, upgradeUrl: url };
    },

    async entitledScopes(userId) {
      const memberships = await prisma.teamMember.findMany({
        where: { userId },
        select: { teamId: true, team: { select: { entitlements: true } } },
      });
      const current = await state();
      if (!current) {
        warnOpen();
        return { personal: true, teamIds: memberships.map((m) => m.teamId) };
      }
      return {
        personal: enabled(await personalValues(current.issuer, userId), GLOUTON_ACCESS),
        teamIds: memberships.filter((m) => enabled(m.team.entitlements, GLOUTON_ACCESS)).map((m) => m.teamId),
      };
    },
  };
}

/** The scope check background jobs run before doing any work: false for a non-member or a scope without access. */
export function jobGate(reader: ForfaitReader) {
  return async (scope: { userId: string; teamId: string | null }): Promise<boolean> => {
    if (scope.teamId) return (await reader.team(scope.userId, scope.teamId))?.allowed ?? false;
    return (await reader.personal(scope.userId)).allowed;
  };
}

/** Loads the owner and team of the row a by-id procedure acts on. */
export function rowLoader(prisma: PrismaClient) {
  const select = { userId: true, teamId: true } as const;
  return (model: 'lead' | 'huntSession' | 'auditSession', id: string) => {
    if (model === 'lead') return prisma.lead.findUnique({ where: { id }, select });
    if (model === 'huntSession') return prisma.huntSession.findUnique({ where: { id }, select });
    return prisma.auditSession.findUnique({ where: { id }, select });
  };
}

/**
 * Counts the teams not linked to any Registre space. They never receive
 * entitlements, so once enforcement is on their members can only read,
 * export, delete and leave; the boot log reports them so an admin can link
 * or remove them.
 */
export async function reportUnlinkedTeams(prisma: PrismaClient): Promise<number> {
  const [count, enforced] = await Promise.all([
    prisma.team.count({ where: { registreSpaceId: null } }),
    prisma.forfaitState.count(),
  ]);
  if (count > 0) {
    const message = enforced
      ? '[FORFAIT] Teams not linked to Registre have no plan: members can only read, export, delete and leave'
      : '[FORFAIT] Teams not linked to Registre will have no plan once entitlements arrive';
    logger.warn({ count }, message);
  }
  return count;
}
