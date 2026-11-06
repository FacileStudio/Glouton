import type { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { Scope } from '../../utils/scope';
import { dbForfait } from '../forfait/store';
import { planRequired, type PlanMode } from '../forfait/gate';

/** Who is reading or writing contacts, and which scopes (personal, teams) they can see. */
export interface Access {
  userId: string;
  actor: string | null;
  teamIds: string[];
  personal: boolean;
  /** The team a new row lands in when none is named: set only when the web app works in one team. */
  defaultTeamId?: string;
  /** Where to buy access for the personal scope, set when it has none. */
  upgradeUrl?: string;
}

export type OwnedWhere = {
  OR: Array<{ userId: string; teamId: null } | { teamId: { in: string[] } }>;
};

/** A where clause matching rows the caller can see, valid on every userId/teamId-owned model. */
export function ownedWhere(access: Access): OwnedWhere {
  const OR: OwnedWhere['OR'] = [];
  if (access.personal) OR.push({ userId: access.userId, teamId: null });
  if (access.teamIds.length > 0) OR.push({ teamId: { in: access.teamIds } });
  return { OR };
}

/** Access narrowed to one resolved scope, as the web app works one space at a time. */
export function accessForScope(scope: Scope, actor: string | null): Access {
  return scope.type === 'team'
    ? { userId: scope.userId, actor, teamIds: [scope.teamId], personal: false, defaultTeamId: scope.teamId }
    : { userId: scope.userId, actor, teamIds: [], personal: true };
}

/**
 * Access across every scope the user may use now: the personal scope and the
 * teams they belong to. In `paid` mode (the default) each is kept only while
 * it has `glouton.access`; in `free` mode (reading, exporting, deleting
 * existing data) every scope the user belongs to is kept.
 */
export async function accessForUser(
  prisma: PrismaClient,
  userId: string,
  actor: string | null,
  mode: PlanMode = 'paid'
): Promise<Access> {
  if (mode === 'free') {
    const memberships = await prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } });
    return { userId, actor, teamIds: memberships.map((m) => m.teamId), personal: true };
  }
  const reader = dbForfait(prisma);
  const scopes = await reader.entitledScopes(userId);
  const access: Access = { userId, actor, teamIds: scopes.teamIds, personal: scopes.personal };
  if (!scopes.personal) access.upgradeUrl = (await reader.personal(userId)).upgradeUrl;
  return access;
}

/**
 * The team a new row lands in: the named team when the caller may use it,
 * else personal, else the one team the web app works in. Without any of
 * these the write is refused with the personal upgrade URL; it never lands
 * in some other team.
 */
export function targetTeam(access: Access, teamId: string | null | undefined): string | null {
  if (!teamId) {
    if (access.personal) return null;
    if (access.defaultTeamId) return access.defaultTeamId;
    throw planRequired(access.upgradeUrl ?? '');
  }
  if (!access.teamIds.includes(teamId)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this team' });
  }
  return teamId;
}

/** The label stored on activities and suggestions for who made a change. */
export function actorLabel(access: Access): string {
  return access.actor ?? `user:${access.userId}`;
}
