import { PrismaClient, Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { logger } from '@repo/logger';
import { dbForfait } from '../modules/forfait/store';
import { requirePersonal, requireTeam } from '../modules/forfait/gate';

export type Scope =
  | { type: 'personal'; userId: string }
  | { type: 'team'; teamId: string; userId: string };

export async function resolveScope(
  prisma: PrismaClient,
  userId: string,
  teamId?: string | null
): Promise<Scope> {
  if (!teamId) {
    await requirePersonal(dbForfait(prisma), userId);
    return { type: 'personal', userId };
  }

  await requireTeam(dbForfait(prisma), userId, teamId).catch((error: unknown) => {
    if (error instanceof TRPCError && error.code === 'FORBIDDEN') {
      logger.warn({ userId, teamId }, '[SCOPE] User not a member of team');
    }
    throw error;
  });

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
