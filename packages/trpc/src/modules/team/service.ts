import { TRPCError } from '@trpc/server';
import { prisma } from '@repo/database/prisma';
import { encrypt, decrypt } from '@repo/utils';
import { TeamRole, checkTeamPermission, checkTeamMembership, isTeamOwner } from './permissions';

export const teamService = {
  listUserTeams: async (userId: string) => {
    const memberships = await prisma.teamMember.findMany({
      where: { userId },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return memberships.map((membership) => ({
      id: membership.team.id,
      name: membership.team.name,
      description: membership.team.description,
      role: membership.role,
      joinedAt: membership.joinedAt,
      createdAt: membership.team.createdAt,
      updatedAt: membership.team.updatedAt,
    }));
  },

  getTeam: async (teamId: string, userId: string) => {
    const role = await checkTeamMembership(userId, teamId);

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!team) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Team not found',
      });
    }

    return {
      ...team,
      userRole: role,
    };
  },

  createTeam: async (
    data: { name: string; description?: string },
    ownerId: string
  ) => {
    const team = await prisma.team.create({
      data: {
        name: data.name,
        description: data.description || null,
        members: {
          create: {
            userId: ownerId,
            role: TeamRole.OWNER,
          },
        },
      },
      include: {
        members: {
          where: { userId: ownerId },
        },
      },
    });

    return {
      id: team.id,
      name: team.name,
      description: team.description,
      role: TeamRole.OWNER,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    };
  },

  updateTeam: async (
    teamId: string,
    userId: string,
    data: { name?: string; description?: string }
  ) => {
    await checkTeamPermission(userId, teamId, TeamRole.ADMIN);

    if (!data.name && data.description === undefined) {
      return teamService.getTeam(teamId, userId);
    }

    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;

    const team = await prisma.team.update({
      where: { id: teamId },
      data: updateData,
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const membership = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId,
        },
      },
    });

    return {
      ...team,
      userRole: membership?.role as TeamRole,
    };
  },

  deleteTeam: async (teamId: string, userId: string) => {
    await checkTeamPermission(userId, teamId, TeamRole.OWNER);

    const team = await prisma.team.delete({
      where: { id: teamId },
    });

    return { success: true, teamId: team.id };
  },

  getTeamMembers: async (teamId: string, userId: string) => {
    await checkTeamPermission(userId, teamId, TeamRole.MEMBER);

    const members = await prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
    });

    return members.map((member) => ({
      id: member.id,
      userId: member.user.id,
      email: member.user.email,
      firstName: member.user.firstName,
      lastName: member.user.lastName,
      role: member.role,
      joinedAt: member.joinedAt,
    }));
  },

  addTeamMember: async (
    teamId: string,
    requesterId: string,
    email: string,
    role: TeamRole
  ) => {
    await checkTeamPermission(requesterId, teamId, TeamRole.ADMIN);

    if (role === TeamRole.OWNER) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot add members with OWNER role. Transfer ownership instead.',
      });
    }

    const targetUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    if (!targetUser) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User with this email not found',
      });
    }

    const existingMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: targetUser.id,
        },
      },
    });

    if (existingMember) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'User is already a team member',
      });
    }

    const member = await prisma.teamMember.create({
      data: {
        teamId,
        userId: targetUser.id,
        role,
      },
    });

    return {
      id: member.id,
      userId: targetUser.id,
      email: targetUser.email,
      firstName: targetUser.firstName,
      lastName: targetUser.lastName,
      role: member.role,
      joinedAt: member.joinedAt,
    };
  },

  removeTeamMember: async (
    teamId: string,
    requesterId: string,
    targetUserId: string
  ) => {
    await checkTeamPermission(requesterId, teamId, TeamRole.ADMIN);

    const targetMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMember) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User is not a team member',
      });
    }

    if (targetMember.role === TeamRole.OWNER) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Cannot remove team owner. Transfer ownership first.',
      });
    }

    if (requesterId === targetUserId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Use leaveTeam to remove yourself from the team',
      });
    }

    await prisma.teamMember.delete({
      where: {
        teamId_userId: {
          teamId,
          userId: targetUserId,
        },
      },
    });

    return { success: true, userId: targetUserId };
  },

  updateMemberRole: async (
    teamId: string,
    requesterId: string,
    targetUserId: string,
    newRole: TeamRole
  ) => {
    await checkTeamPermission(requesterId, teamId, TeamRole.OWNER);

    if (requesterId === targetUserId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot change your own role',
      });
    }

    const targetMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: targetUserId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!targetMember) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User is not a team member',
      });
    }

    const updatedMember = await prisma.teamMember.update({
      where: {
        teamId_userId: {
          teamId,
          userId: targetUserId,
        },
      },
      data: { role: newRole },
    });

    return {
      id: updatedMember.id,
      userId: targetMember.user.id,
      email: targetMember.user.email,
      firstName: targetMember.user.firstName,
      lastName: targetMember.user.lastName,
      role: updatedMember.role,
      joinedAt: updatedMember.joinedAt,
    };
  },

  leaveTeam: async (teamId: string, userId: string) => {
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
        code: 'NOT_FOUND',
        message: 'You are not a member of this team',
      });
    }

    if (member.role === TeamRole.OWNER) {
      const memberCount = await prisma.teamMember.count({
        where: { teamId },
      });

      if (memberCount > 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Cannot leave team as owner. Transfer ownership or delete the team first.',
        });
      }
    }

    await prisma.teamMember.delete({
      where: {
        teamId_userId: {
          teamId,
          userId,
        },
      },
    });

    return { success: true };
  },

  getTeamStats: async (teamId: string, userId: string) => {
    await checkTeamPermission(userId, teamId, TeamRole.MEMBER);

    const [totalLeads, totalHunts, totalAudits, emailsSent, memberCount] =
      await Promise.all([
        prisma.lead.count({ where: { teamId } }),
        prisma.huntSession.count({ where: { teamId } }),
        prisma.auditSession.count({ where: { teamId } }),
        prisma.emailOutreach.count({ where: { teamId } }),
        prisma.teamMember.count({ where: { teamId } }),
      ]);

    const activeHunts = await prisma.huntSession.count({
      where: {
        teamId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    const hotLeads = await prisma.lead.count({
      where: { teamId, status: 'HOT' },
    });

    return {
      totalLeads,
      totalHunts,
      activeHunts,
      totalAudits,
      emailsSent,
      memberCount,
      hotLeads,
    };
  },

  getTeamApiKeys: async (teamId: string, userId: string) => {
    await checkTeamPermission(userId, teamId, TeamRole.ADMIN);

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        hunterApiKey: true,
        apolloApiKey: true,
        snovApiKey: true,
        hasdataApiKey: true,
        contactoutApiKey: true,
        googleMapsApiKey: true,
      },
    });

    if (!team) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Team not found',
      });
    }

    return {
      hunterApiKey: team.hunterApiKey,
      apolloApiKey: team.apolloApiKey,
      snovApiKey: team.snovApiKey,
      hasdataApiKey: team.hasdataApiKey,
      contactoutApiKey: team.contactoutApiKey,
      googleMapsApiKey: team.googleMapsApiKey,
    };
  },

  updateTeamApiKeys: async (
    teamId: string,
    userId: string,
    apiKeys: {
      hunterApiKey?: string;
      googleMapsApiKey?: string;
    }
  ) => {
    await checkTeamPermission(userId, teamId, TeamRole.ADMIN);

    const updateData: any = {};
    if (apiKeys.hunterApiKey !== undefined)
      updateData.hunterApiKey = apiKeys.hunterApiKey || null;
    if (apiKeys.googleMapsApiKey !== undefined)
      updateData.googleMapsApiKey = apiKeys.googleMapsApiKey || null;

    const team = await prisma.team.update({
      where: { id: teamId },
      data: updateData,
      select: {
        hunterApiKey: true,
        googleMapsApiKey: true,
      },
    });

    return team;
  },

  getTeamSmtpConfig: async (teamId: string, userId: string, encryptionKey: string) => {
    await checkTeamPermission(userId, teamId, TeamRole.MEMBER);

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        smtpPass: true,
        smtpFromName: true,
        smtpFromEmail: true,
      },
    });

    if (!team) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Team not found',
      });
    }

    let decryptedPass: string | null = null;
    if (team.smtpPass) {
      try {
        decryptedPass = decrypt(team.smtpPass, encryptionKey);
      } catch (error) {
        decryptedPass = null;
      }
    }

    return {
      smtpHost: team.smtpHost,
      smtpPort: team.smtpPort,
      smtpSecure: team.smtpSecure,
      smtpUser: team.smtpUser,
      smtpPass: decryptedPass,
      smtpFromName: team.smtpFromName,
      smtpFromEmail: team.smtpFromEmail,
    };
  },

  updateTeamSmtpConfig: async (
    teamId: string,
    userId: string,
    smtpConfig: {
      smtpHost?: string;
      smtpPort?: number;
      smtpSecure?: boolean;
      smtpUser?: string;
      smtpPass?: string;
      smtpFromName?: string;
      smtpFromEmail?: string;
    },
    encryptionKey: string
  ) => {
    await checkTeamPermission(userId, teamId, TeamRole.ADMIN);

    let encryptedPass: string | null = null;
    if (smtpConfig.smtpPass) {
      encryptedPass = encrypt(smtpConfig.smtpPass, encryptionKey);
    }

    const updateData: any = {};
    if (smtpConfig.smtpHost !== undefined)
      updateData.smtpHost = smtpConfig.smtpHost || null;
    if (smtpConfig.smtpPort !== undefined)
      updateData.smtpPort = smtpConfig.smtpPort || null;
    if (smtpConfig.smtpSecure !== undefined)
      updateData.smtpSecure = smtpConfig.smtpSecure;
    if (smtpConfig.smtpUser !== undefined)
      updateData.smtpUser = smtpConfig.smtpUser || null;
    if (smtpConfig.smtpPass !== undefined) updateData.smtpPass = encryptedPass;
    if (smtpConfig.smtpFromName !== undefined)
      updateData.smtpFromName = smtpConfig.smtpFromName || null;
    if (smtpConfig.smtpFromEmail !== undefined)
      updateData.smtpFromEmail = smtpConfig.smtpFromEmail || null;

    const team = await prisma.team.update({
      where: { id: teamId },
      data: updateData,
      select: {
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        smtpFromName: true,
        smtpFromEmail: true,
      },
    });

    return team;
  },
};

export default teamService;
