import { TRPCError } from '@trpc/server';
import { prisma } from '@repo/database/prisma';

export enum TeamRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

const roleHierarchy: Record<TeamRole, number> = {
  [TeamRole.OWNER]: 3,
  [TeamRole.ADMIN]: 2,
  [TeamRole.MEMBER]: 1,
};

export async function checkTeamMembership(
  userId: string,
  teamId: string
): Promise<TeamRole> {
  const member = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId,
        userId,
      },
    },
  });

  if (!member) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Not a team member',
    });
  }

  return member.role as TeamRole;
}

export async function checkTeamPermission(
  userId: string,
  teamId: string,
  requiredRole: TeamRole | TeamRole[]
): Promise<void> {
  const userRole = await checkTeamMembership(userId, teamId);

  const required = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  const hasPermission = required.some(
    (role) => roleHierarchy[userRole] >= roleHierarchy[role]
  );

  if (!hasPermission) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Insufficient permissions',
    });
  }
}

export async function canAccessLead(userId: string, leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { userId: true, teamId: true },
  });

  if (!lead) return false;

  if (lead.userId === userId && !lead.teamId) return true;

  if (lead.teamId) {
    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: lead.teamId,
          userId,
        },
      },
    });
    return !!member;
  }

  return false;
}

export async function isTeamOwner(userId: string, teamId: string): Promise<boolean> {
  const member = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId,
        userId,
      },
    },
  });

  return member?.role === TeamRole.OWNER;
}
