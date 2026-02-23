import { TRPCError } from '@trpc/server';
import { prisma } from '@repo/database/prisma';
import { type AuthManager } from '@repo/auth';
import type { UserRole } from '@repo/types';
import { UserStatus } from '@prisma/client';

export const userService = {
  getProfile: async (userId: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return user;
  },

  getConfiguredSources: async (userId: string, teamId?: string) => {
    if (teamId) {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { hunterApiKey: true, googleMapsApiKey: true },
      });

      if (!team) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Team not found',
        });
      }

      const sources: string[] = [];
      if (team.hunterApiKey) sources.push('HUNTER');
      if (team.googleMapsApiKey) sources.push('GOOGLE_MAPS');
      return sources;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { hunterApiKey: true, googleMapsApiKey: true },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    const sources: string[] = [];
    if (user.hunterApiKey) sources.push('HUNTER');
    if (user.googleMapsApiKey) sources.push('GOOGLE_MAPS');
    return sources;
  },

  getAllUsers: async (
    filters?: {
      status?: 'all' | 'active' | 'suspended' | 'banned' | 'pending';
      role?: 'all' | 'admin' | 'user';
      emailVerified?: boolean;
      isPremium?: boolean;
    }
  ) => {
    const where: any = {};

    if (filters?.status && filters.status !== 'all') {
      where.status = filters.status.toUpperCase() as UserStatus;
    }

    if (filters?.role && filters.role !== 'all') {
      where.role = filters.role.toUpperCase() as UserRole;
    }

    if (filters?.emailVerified !== undefined) {
      where.emailVerified = filters.emailVerified;
    }

    if (filters?.isPremium !== undefined) {
      where.isPremium = filters.isPremium;
    }

    return await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  },

  getUserById: async (userId: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return user;
  },

  getUserStats: async () => {
    const [
      totalUsers,
      activeUsers,
      bannedUsers,
      suspendedUsers,
      premiumUsers,
      verifiedUsers,
      adminUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.user.count({ where: { isSuspended: true } }),
      prisma.user.count({ where: { isPremium: true } }),
      prisma.user.count({ where: { emailVerified: true } }),
      prisma.user.count({ where: { role: 'ADMIN' } }),
    ]);

    return {
      totalUsers,
      activeUsers,
      bannedUsers,
      suspendedUsers,
      premiumUsers,
      verifiedUsers,
      adminUsers,
    };
  },

  updateUser: async (
    userId: string,
    data: { isPremium?: boolean; role?: 'USER' | 'ADMIN' }
  ) => {
    if (data.isPremium === undefined && data.role === undefined) {
      return userService.getUserById(userId);
    }

    const updateData: any = {};

    if (data.isPremium !== undefined) {
      updateData.isPremium = data.isPremium;
    }

    if (data.role !== undefined) {
      updateData.role = data.role;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    if (!updatedUser) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    return updatedUser;
  },

  banUser: async (userId: string, reason: string, bannedBy: string) => {
    const bannedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isBanned: true,
        status: 'BANNED',
        banReason: reason,
        bannedAt: new Date(),
        bannedBy: bannedBy,
      },
    });
    return bannedUser;
  },

  unbanUser: async (userId: string) => {
    const unbannedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isBanned: false,
        status: 'ACTIVE',
        banReason: null,
        bannedAt: null,
        bannedBy: null,
      },
    });
    return unbannedUser;
  },

  suspendUser: async (userId: string, reason: string, until: Date) => {
    const suspendedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isSuspended: true,
        status: 'SUSPENDED',
        suspensionReason: reason,
        suspendedUntil: until,
      },
    });
    return suspendedUser;
  },

  unsuspendUser: async (userId: string) => {
    const unsuspendedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isSuspended: false,
        status: 'ACTIVE',
        suspensionReason: null,
        suspendedUntil: null,
      },
    });
    return unsuspendedUser;
  },

  verifyEmail: async (userId: string) => {
    const verifiedUser = await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
    return verifiedUser;
  },

  deleteUser: async (userId: string) => {
    const deletedUser = await prisma.user.delete({
      where: { id: userId },
    });
    return deletedUser;
  },

  bulkDeleteUsers: async (userIds: string[]) => {
    if (userIds.length === 0) return { count: 0 };
    const result = await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
    return { count: result.count };
  },

  updateProfile: async (
    userId: string,
    data: { firstName?: string; lastName?: string }
  ) => {
    if (data.firstName === undefined && data.lastName === undefined) {
      return userService.getUserById(userId);
    }

    const updateData: any = {};

    if (data.firstName !== undefined) {
      updateData.firstName = data.firstName;
    }

    if (data.lastName !== undefined) {
      updateData.lastName = data.lastName;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
    return updatedUser;
  },

  changePassword: async (
    auth: AuthManager,
    userId: string,
    currentPassword: string,
    newPassword: string
  ) => {
    const user = await userService.getUserById(userId);
    const isValid = await auth.verifyPassword(currentPassword, user.password);

    if (!isValid) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Current password is incorrect',
      });
    }

    const hashedPassword = await auth.hashPassword(newPassword);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
    return updatedUser;
  },

  deleteOwnAccount: async (userId: string) => {
    const deletedUser = await prisma.user.delete({
      where: { id: userId },
    });

    if (!deletedUser) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return deletedUser;
  },

  updateApiKeys: async (
    userId: string,
    apiKeys: {
      hunterApiKey?: string;
      googleMapsApiKey?: string;
    }
  ) => {
    if (apiKeys.hunterApiKey === undefined && apiKeys.googleMapsApiKey === undefined) {
      return userService.getUserById(userId);
    }

    const updateData: any = {};
    if (apiKeys.hunterApiKey !== undefined) {
      updateData.hunterApiKey = apiKeys.hunterApiKey || null;
    }
    if (apiKeys.googleMapsApiKey !== undefined) {
      updateData.googleMapsApiKey = apiKeys.googleMapsApiKey || null;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return updatedUser;
  },

  getSmtpConfig: async (userId: string, auth: AuthManager) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
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

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    let decryptedPass: string | null = null;
    if (user.smtpPass) {
      try {
        decryptedPass = auth.decryptData(user.smtpPass);
      } catch (error) {
        decryptedPass = null;
      }
    }

    return {
      smtpHost: user.smtpHost,
      smtpPort: user.smtpPort,
      smtpSecure: user.smtpSecure,
      smtpUser: user.smtpUser,
      smtpPass: decryptedPass,
      smtpFromName: user.smtpFromName,
      smtpFromEmail: user.smtpFromEmail,
    };
  },

  updateSmtpConfig: async (
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
    let encryptedPass: string | null = null;
    if (smtpConfig.smtpPass) {
      encryptedPass = auth.encryptData(smtpConfig.smtpPass);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        smtpHost: smtpConfig.smtpHost ?? null,
        smtpPort: smtpConfig.smtpPort ?? null,
        smtpSecure: smtpConfig.smtpSecure ?? null,
        smtpUser: smtpConfig.smtpUser ?? null,
        smtpPass: encryptedPass,
        smtpFromName: smtpConfig.smtpFromName ?? null,
        smtpFromEmail: smtpConfig.smtpFromEmail ?? null,
      },
    });

    return updatedUser;
  },
};

export default userService;
