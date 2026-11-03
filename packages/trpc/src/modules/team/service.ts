import { TRPCError } from '@trpc/server';
import { prisma } from '@repo/database/prisma';
import { dispatchWebhookEvent, sendWebhook, type WebhookEvent } from '@repo/webhooks';
import { TeamRole, checkTeamPermission, checkTeamMembership, isTeamOwner } from './permissions';
import type { AuthManager } from '@repo/auth';

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
            _count: {
              select: {
                members: true,
                leads: true
              }
            }
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
      _count: membership.team._count,
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
        message: 'Équipe introuvable',
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
            avatarUrl: true,
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
      avatarUrl: member.user.avatarUrl,
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
        message: "Impossible d'ajouter un membre avec le rôle propriétaire.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const targetUser = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    if (!targetUser) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Aucun compte trouvé pour ${normalizedEmail}. Cette personne doit d'abord créer un compte, puis vous pourrez l'ajouter.`,
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
        message: "Cette personne fait déjà partie de l'équipe.",
      });
    }

    const member = await prisma.teamMember.create({
      data: {
        teamId,
        userId: targetUser.id,
        role,
      },
    });

    dispatchWebhookEvent({
      event: 'team.member_added',
      teamId,
      data: {
        email: targetUser.email,
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        role: member.role,
      },
    }).catch(() => {});

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
      include: {
        user: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
    });

    if (!targetMember) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: "Cet utilisateur n'est pas membre de l'équipe.",
      });
    }

    if (targetMember.role === TeamRole.OWNER) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: "Impossible de retirer le propriétaire de l'équipe.",
      });
    }

    if (requesterId === targetUserId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Utilisez « Quitter l\'équipe » pour vous retirer vous-même.',
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

    dispatchWebhookEvent({
      event: 'team.member_removed',
      teamId,
      data: {
        email: targetMember.user.email,
        firstName: targetMember.user.firstName,
        lastName: targetMember.user.lastName,
        role: targetMember.role,
      },
    }).catch(() => {});

    return { success: true, userId: targetUserId };
  },

  updateMemberRole: async (
    teamId: string,
    requesterId: string,
    targetUserId: string,
    newRole: TeamRole
  ) => {
    await checkTeamPermission(requesterId, teamId, TeamRole.OWNER);

    if (newRole === TeamRole.OWNER) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: "Impossible de promouvoir un membre propriétaire : chaque équipe n'a qu'un seul propriétaire.",
      });
    }

    if (requesterId === targetUserId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Vous ne pouvez pas modifier votre propre rôle.',
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
        message: "Cet utilisateur n'est pas membre de l'équipe.",
      });
    }

    if (targetMember.role === TeamRole.OWNER) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: "Impossible de modifier le rôle du propriétaire de l'équipe.",
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
        message: "Vous n'êtes pas membre de cette équipe.",
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
            "Le propriétaire ne peut pas quitter une équipe qui compte encore des membres. Retirez les membres ou supprimez l'équipe.",
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

  getTeamSmtpConfig: async (teamId: string, userId: string, auth: AuthManager) => {
    // ADMIN+ only: this returns the decrypted SMTP password.
    await checkTeamPermission(userId, teamId, TeamRole.ADMIN);

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
        message: 'Équipe introuvable',
      });
    }

    let decryptedPass: string | null = null;
    if (team.smtpPass) {
      try {
        decryptedPass = auth.decryptData(team.smtpPass);
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
    auth: AuthManager
  ) => {
    await checkTeamPermission(userId, teamId, TeamRole.ADMIN);

    const updateData: any = {};
    if (smtpConfig.smtpHost !== undefined)
      updateData.smtpHost = smtpConfig.smtpHost || null;
    if (smtpConfig.smtpPort !== undefined)
      updateData.smtpPort = smtpConfig.smtpPort || null;
    if (smtpConfig.smtpSecure !== undefined)
      updateData.smtpSecure = smtpConfig.smtpSecure;
    if (smtpConfig.smtpUser !== undefined)
      updateData.smtpUser = smtpConfig.smtpUser || null;
    if (smtpConfig.smtpPass !== undefined) {
      if (smtpConfig.smtpPass) {
        updateData.smtpPass = auth.encryptData(smtpConfig.smtpPass);
      } else {
        updateData.smtpPass = null;
      }
    }
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

  // --- Webhooks sortants (Nook) --------------------------------------------

  listTeamWebhooks: async (teamId: string, userId: string) => {
    await checkTeamPermission(userId, teamId, TeamRole.ADMIN);

    return prisma.teamWebhook.findMany({
      where: { teamId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        url: true,
        enabled: true,
        events: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  createTeamWebhook: async (
    teamId: string,
    userId: string,
    data: { name: string; url: string; events: WebhookEvent[]; enabled?: boolean }
  ) => {
    await checkTeamPermission(userId, teamId, TeamRole.ADMIN);

    return prisma.teamWebhook.create({
      data: {
        teamId,
        name: data.name,
        url: data.url,
        events: data.events,
        enabled: data.enabled ?? true,
      },
      select: {
        id: true,
        name: true,
        url: true,
        enabled: true,
        events: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  updateTeamWebhook: async (
    teamId: string,
    userId: string,
    webhookId: string,
    data: { name?: string; url?: string; events?: WebhookEvent[]; enabled?: boolean }
  ) => {
    await checkTeamPermission(userId, teamId, TeamRole.ADMIN);

    // Scoped lookup: a webhook id from another team must 404, not update.
    const webhook = await prisma.teamWebhook.findFirst({
      where: { id: webhookId, teamId },
      select: { id: true },
    });

    if (!webhook) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Webhook introuvable',
      });
    }

    return prisma.teamWebhook.update({
      where: { id: webhookId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.url !== undefined ? { url: data.url } : {}),
        ...(data.events !== undefined ? { events: data.events } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      },
      select: {
        id: true,
        name: true,
        url: true,
        enabled: true,
        events: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  deleteTeamWebhook: async (teamId: string, userId: string, webhookId: string) => {
    await checkTeamPermission(userId, teamId, TeamRole.ADMIN);

    const webhook = await prisma.teamWebhook.findFirst({
      where: { id: webhookId, teamId },
      select: { id: true },
    });

    if (!webhook) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Webhook introuvable',
      });
    }

    await prisma.teamWebhook.delete({ where: { id: webhookId } });

    return { success: true, webhookId };
  },

  testTeamWebhook: async (teamId: string, userId: string, url: string) => {
    await checkTeamPermission(userId, teamId, TeamRole.ADMIN);

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true },
    });

    if (!team) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Équipe introuvable',
      });
    }

    try {
      await sendWebhook(url, {
        app: 'glouton',
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        team: { id: team.id, name: team.name },
        data: { message: 'Test de webhook envoyé depuis les paramètres de l\'équipe.' },
      });
      return { success: true, message: 'Webhook joignable, payload de test envoyé.' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Échec de l'envoi du test : ${errorMessage}`,
      });
    }
  },
};

export default teamService;
