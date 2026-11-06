import { PrismaClient, Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { logger } from '@repo/logger';
import { dbForfait } from '../modules/forfait/store';
import { planRequired, requirePersonal, type PlanMode } from '../modules/forfait/gate';

export type Scope =
  | { type: 'personal'; userId: string }
  | { type: 'team'; teamId: string; userId: string };

/**
 * The scope a call works in, after checking the caller may use it: personal,
 * or a team they belong to. In `paid` mode (the default) the scope must also
 * have `glouton.access`; in `free` mode (reading, exporting, deleting) the
 * plan is not required.
 */
export async function resolveScope(
  prisma: PrismaClient,
  userId: string,
  teamId?: string | null,
  mode: PlanMode = 'paid'
): Promise<Scope> {
  const reader = dbForfait(prisma);
  if (!teamId) {
    if (mode === 'paid') await requirePersonal(reader, userId);
    return { type: 'personal', userId };
  }

  const verdict = await reader.team(userId, teamId);
  if (!verdict) {
    logger.warn({ userId, teamId }, '[SCOPE] User not a member of team');
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this team' });
  }
  if (mode === 'paid' && !verdict.allowed) throw planRequired(verdict.upgradeUrl);

  logger.info({ userId, teamId }, '[SCOPE] Resolved team scope');
  return { type: 'team', teamId, userId };
}

export function buildLeadFilter(scope: Scope): Prisma.LeadWhereInput {
  if (scope.type === 'personal') {
    return {
      userId: scope.userId,
      teamId: null,
    };
  }

  return {
    teamId: scope.teamId,
  };
}

export function buildHuntFilter(scope: Scope): Prisma.HuntSessionWhereInput {
  if (scope.type === 'personal') {
    return {
      userId: scope.userId,
      teamId: null,
    };
  }

  return {
    teamId: scope.teamId,
  };
}

export function buildAuditFilter(scope: Scope): Prisma.AuditSessionWhereInput {
  if (scope.type === 'personal') {
    return {
      userId: scope.userId,
      teamId: null,
    };
  }

  return {
    teamId: scope.teamId,
  };
}

export function buildEmailFilter(scope: Scope): Prisma.EmailOutreachWhereInput {
  if (scope.type === 'personal') {
    return {
      userId: scope.userId,
      teamId: null,
    };
  }

  return {
    teamId: scope.teamId,
  };
}
