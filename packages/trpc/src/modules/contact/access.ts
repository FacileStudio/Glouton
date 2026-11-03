import type { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { Scope } from '../../utils/scope';

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

/** Access across the personal scope and every team the user belongs to. */
export async function accessForUser(
  prisma: PrismaClient,
  userId: string,
  actor: string | null
): Promise<Access> {
  const memberships = await prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } });
  return { userId, actor, teamIds: memberships.map((m) => m.teamId), personal: true };
}

/** The team a new row lands in: null for personal, else a team the caller belongs to. */
export function targetTeam(access: Access, teamId: string | null | undefined): string | null {
  if (!teamId) {
    if (access.personal) return null;
    return access.teamIds[0] ?? null;
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
