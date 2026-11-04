import type { Prisma, PrismaClient, TeamRole } from '@prisma/client';
import {
  RoleAdmin,
  RoleMember,
  RoleOwner,
  Syncer,
  type DirectoryMember,
  type DirectorySpace,
  type ImportSpace,
  type Snapshot,
  type SyncLogger,
} from './registre-directory';
import { httpsPicture, splitName } from './oidc';
import { forfait } from '@repo/trpc';

/**
 * Glouton's half of the suite shared-spaces contract: every `Team` is a
 * shared space (personal work is the team-less scope, never a Team row), its
 * OWNER/ADMIN/MEMBER ladder is Registre's one to one, and a Registre identity
 * is an `Account` row with `providerId` = the issuer and `accountId` = `sub`.
 */

type Tx = Prisma.TransactionClient;

const rank: Record<TeamRole, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1 };

/** What Apply and the import need beyond the snapshot itself. */
export interface DirectoryDeps {
  db: PrismaClient;
  issuer: string;
  hashPassword: (password: string) => Promise<string>;
  logger: SyncLogger;
}

/** Maps a Registre role onto Glouton's; anything unknown is an ordinary member. */
export function toTeamRole(role: string): TeamRole {
  if (role === RoleOwner) return 'OWNER';
  if (role === RoleAdmin) return 'ADMIN';
  return 'MEMBER';
}

/** Maps a Glouton role onto Registre's. */
export function fromTeamRole(role: TeamRole): string {
  if (role === 'OWNER') return RoleOwner;
  if (role === 'ADMIN') return RoleAdmin;
  return RoleMember;
}

/**
 * Every team that has members, ready for Registre's one-time import. A member
 * is sent by their Registre `sub` when Glouton knows it, by email otherwise.
 */
export async function buildImport(db: PrismaClient, issuer: string): Promise<ImportSpace[]> {
  const teams = await db.team.findMany({
    select: {
      name: true,
      members: {
        select: {
          role: true,
          user: {
            select: { email: true, accounts: { where: { providerId: issuer }, select: { accountId: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return teams
    .filter((team) => team.members.length > 0)
    .map((team) => ({
      name: team.name,
      members: team.members.map((member) => {
        const sub = member.user.accounts[0]?.accountId;
        const role = fromTeamRole(member.role);
        return sub ? { sub, role } : { email: member.user.email, role };
      }),
    }));
}

/**
 * Makes Glouton's teams match the snapshot, in one transaction, idempotently.
 * Spaces link by `registreSpaceId`, then by an unlinked team of the same name
 * (case-insensitive), else a team is created. Members resolve by Registre
 * identity, then by email, else a user is pre-provisioned so their first SSO
 * sign-in lands on it. Memberships of users with a Registre identity who are
 * absent from the space are removed; local-only users and unlinked teams are
 * never touched. A linked team missing from the snapshot is left alone and
 * logged, because Registre v1 has no space deletion. Plan entitlements are
 * stored in the same transaction (see forfait.applyEntitlements).
 */
export async function applySnapshot(deps: DirectoryDeps, snapshot: Snapshot): Promise<void> {
  const orphans = await deps.db.$transaction(
    async (tx) => {
      const seen: string[] = [];
      for (const space of snapshot.spaces) {
        const teamId = await linkTeam(tx, space);
        seen.push(teamId);
        await syncMembers(tx, deps, teamId, space.members);
      }
      const outcome = await forfait.applyEntitlements(tx, snapshot, deps.issuer);
      if (outcome === 'not-pushed') {
        deps.logger.warn(
          { version: snapshot.version },
          '[FORFAIT] Snapshot has no entitlements revision, keeping the stored values (fail-open until the first one)'
        );
      } else if (outcome === 'stale') {
        deps.logger.warn(
          { version: snapshot.version, revision: snapshot.entitlements_revision },
          '[FORFAIT] Snapshot entitlements revision is older than the last applied one, ignored them'
        );
      }
      return tx.team.findMany({
        where: { registreSpaceId: { not: null }, id: { notIn: seen } },
        select: { id: true, name: true },
      });
    },
    { maxWait: 10_000, timeout: 60_000 }
  );
  if (orphans.length > 0) {
    deps.logger.warn({ teams: orphans }, '[REGISTRE] Linked teams missing from the snapshot were left alone');
  }
}

/** Finds or creates the team mirroring `space` and sets its link and name. */
async function linkTeam(tx: Tx, space: DirectorySpace): Promise<string> {
  const select = { id: true, name: true, registreSpaceId: true } as const;
  const team =
    (await tx.team.findUnique({ where: { registreSpaceId: space.id }, select })) ??
    (await tx.team.findFirst({
      where: { registreSpaceId: null, name: { equals: space.name, mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
      select,
    }));
  if (!team) {
    const created = await tx.team.create({ data: { name: space.name, registreSpaceId: space.id }, select });
    return created.id;
  }
  if (team.name !== space.name || team.registreSpaceId !== space.id) {
    await tx.team.update({ where: { id: team.id }, data: { name: space.name, registreSpaceId: space.id } });
  }
  return team.id;
}

/** Makes one team's memberships match the space, sparing local-only users. */
async function syncMembers(tx: Tx, deps: DirectoryDeps, teamId: string, members: DirectoryMember[]) {
  const desired = new Map<string, TeamRole>();
  for (const member of members) {
    if (!member.sub) continue;
    const userId = await resolveMember(tx, deps, member);
    if (!userId) continue;
    const role = toTeamRole(member.role);
    const held = desired.get(userId);
    desired.set(userId, held && rank[held] > rank[role] ? held : role);
  }
  const current = await tx.teamMember.findMany({
    where: { teamId },
    select: {
      id: true,
      userId: true,
      role: true,
      user: { select: { accounts: { where: { providerId: deps.issuer }, select: { id: true } } } },
    },
  });
  for (const membership of current) {
    const role = desired.get(membership.userId);
    if (role && role !== membership.role) {
      await tx.teamMember.update({ where: { id: membership.id }, data: { role } });
    } else if (!role && membership.user.accounts.length > 0) {
      await tx.teamMember.delete({ where: { id: membership.id } });
    }
  }
  const present = new Set(current.map((membership) => membership.userId));
  for (const [userId, role] of desired) {
    if (!present.has(userId)) await tx.teamMember.create({ data: { teamId, userId, role } });
  }
}

/**
 * Returns the local user for a snapshot member: by Registre identity, then by
 * email (recording the identity), else a pre-provisioned user with an
 * unguessable password, since sign-in for them goes through SSO. Like the SSO
 * fallback, the email match links only a local account whose email Glouton
 * verified; an unverified match is skipped and logged, never linked, and the
 * member gets no membership until an admin verifies that account.
 */
async function resolveMember(tx: Tx, deps: DirectoryDeps, member: DirectoryMember): Promise<string | null> {
  const picture = httpsPicture(member.picture);
  const account = await tx.account.findUnique({
    where: { providerId_accountId: { providerId: deps.issuer, accountId: member.sub } },
    select: { userId: true },
  });
  let userId = account?.userId;
  if (!userId) {
    const existing = member.email
      ? await tx.user.findFirst({
          where: { email: { equals: member.email.trim(), mode: 'insensitive' } },
          select: { id: true, emailVerified: true },
        })
      : null;
    if (existing && !existing.emailVerified) {
      deps.logger.warn(
        { userId: existing.id, sub: member.sub },
        '[REGISTRE] Skipped a member whose email matches an unverified local account; an admin must verify it'
      );
      return null;
    }
    userId = existing?.id ?? (await provisionUser(tx, deps, member, picture));
    await tx.account.create({ data: { userId, providerId: deps.issuer, accountId: member.sub } });
  }
  if (picture) {
    await tx.user.updateMany({
      where: { id: userId, OR: [{ avatarUrl: null }, { avatarUrl: { not: picture } }] },
      data: { avatarUrl: picture },
    });
  }
  return userId;
}

/** Creates the local user a Registre member signs in to for the first time. */
async function provisionUser(
  tx: Tx,
  deps: DirectoryDeps,
  member: DirectoryMember,
  picture: string | null
): Promise<string> {
  const { firstName, lastName } = splitName({ email: member.email, name: member.name || undefined });
  const password = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const user = await tx.user.create({
    data: {
      email: member.email.trim(),
      firstName,
      lastName,
      password: await deps.hashPassword(password),
      avatarUrl: picture,
      emailVerified: true,
    },
    select: { id: true },
  });
  return user.id;
}

/** The pieces the boot sequence talks to, faked in tests. */
export interface DirectoryRemote {
  import(spaces: ImportSpace[]): Promise<Snapshot>;
  snapshot(): Promise<Snapshot>;
}

/** How the import retries while Registre is unreachable or not yet deployed. */
export interface ImportRetry {
  initialMs: number;
  maxMs: number;
  sleep: (ms: number) => Promise<void>;
}

const defaultRetry: ImportRetry = {
  initialMs: 30_000,
  maxMs: 5 * 60_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Imports Glouton's teams into Registre, retrying with backoff capped at five
 * minutes, and only then starts the syncer, so no sync can remove anyone
 * before Glouton's own teams are in Registre. Nudges before that are ignored.
 * `ready` settles after the first pull.
 */
export function startDirectorySync(options: {
  remote: DirectoryRemote;
  collect: () => Promise<ImportSpace[]>;
  apply: (snapshot: Snapshot) => Promise<void>;
  logger: SyncLogger;
  retry?: ImportRetry;
  interval?: number;
}): { syncer: Syncer; ready: Promise<void> } {
  const retry = options.retry ?? defaultRetry;
  const syncer = new Syncer(options.remote, options.apply, options.logger, options.interval);
  const ready = (async () => {
    let delay = retry.initialMs;
    for (let attempt = 1; ; attempt++) {
      try {
        await options.remote.import(await options.collect());
        break;
      } catch (error) {
        options.logger.warn({ error, attempt, retryInMs: delay }, '[REGISTRE] Space import failed, retrying');
        await retry.sleep(delay);
        delay = Math.min(delay * 2, retry.maxMs);
      }
    }
    await syncer.run();
  })();
  return { syncer, ready };
}
