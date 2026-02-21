import { PrismaClient, Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { logger } from '@repo/logger';

export type Scope =
  | { type: 'personal'; userId: string }
  | { type: 'team'; teamId: string; userId: string };

export async function resolveScope(
  prisma: PrismaClient,
  userId: string,
  teamId?: string | null
): Promise<Scope> {
  if (!teamId) {
    return { type: 'personal', userId };
  }

  const membership = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT tm.id
    FROM "TeamMember" tm
    WHERE tm."teamId" = ${teamId}::text
    AND tm."userId" = ${userId}::text
    AND tm."isActive" = true
    LIMIT 1
  `;

  if (!membership || membership.length === 0) {
    logger.warn({ userId, teamId }, '[SCOPE] User not a member of team');
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have access to this team',
    });
  }

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
