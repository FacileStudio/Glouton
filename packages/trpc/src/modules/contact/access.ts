import type { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { Scope } from '../../utils/scope';
import { dbForfait } from '../forfait/store';
import { PAYWALL_MESSAGE } from '../forfait/gate';

/** Who is reading or writing contacts, and which scopes (personal, teams) they can see. */
export interface Access {
  userId: string;
  actor: string | null;
  teamIds: string[];
  personal: boolean;
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
    ? { userId: scope.userId, actor, teamIds: [scope.teamId], personal: false }
    : { userId: scope.userId, actor, teamIds: [], personal: true };
}

/**
 * Access across every scope the user may use now: the personal scope and the
 * teams they belong to, each kept only while it has `glouton.access`.
 */
export async function accessForUser(
  prisma: PrismaClient,
  userId: string,
  actor: string | null
): Promise<Access> {
  const scopes = await dbForfait(prisma).entitledScopes(userId);
  return { userId, actor, teamIds: scopes.teamIds, personal: scopes.personal };
}

/** The team a new row lands in: null for personal, else a team the caller belongs to. */
export function targetTeam(access: Access, teamId: string | null | undefined): string | null {
  if (!teamId) {
    if (access.personal) return null;
    const first = access.teamIds[0];
    if (first) return first;
    throw new TRPCError({ code: 'PAYMENT_REQUIRED', message: PAYWALL_MESSAGE });
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
