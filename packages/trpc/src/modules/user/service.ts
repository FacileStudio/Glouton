import { TRPCError } from '@trpc/server';
import { prisma } from '@repo/database/prisma';
import { type AuthManager } from '@repo/auth';
import type { UserRole } from '@repo/types';
import { UserStatus } from '@prisma/client';

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isPremium: true,
  status: true,
  emailVerified: true,
  isBanned: true,
  banReason: true,
  bannedAt: true,
  bannedBy: true,
  isSuspended: true,
  suspendedUntil: true,
  suspensionReason: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function maskKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 4) return '***';
  return `***...${key.slice(-4)}`;
}

function tryDecrypt(auth: AuthManager, value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return auth.decryptData(value);
  } catch {
    return value;
  }
}

export const userService = {
  getProfile: async (userId: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: SAFE_USER_SELECT,
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
      select: SAFE_USER_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },

  getUserById: async (userId: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: SAFE_USER_SELECT,
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
      select: SAFE_USER_SELECT,
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
      select: SAFE_USER_SELECT,
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
      select: SAFE_USER_SELECT,
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
      select: SAFE_USER_SELECT,
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
      select: SAFE_USER_SELECT,
    });
    return unsuspendedUser;
  },

  verifyEmail: async (userId: string) => {
    const verifiedUser = await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
      select: SAFE_USER_SELECT,
    });
    return verifiedUser;
  },

  deleteUser: async (userId: string) => {
    const deletedUser = await prisma.user.delete({
      where: { id: userId },
      select: SAFE_USER_SELECT,
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
      select: SAFE_USER_SELECT,
    });
    return updatedUser;
  },

  changePassword: async (
    auth: AuthManager,
    userId: string,
    currentPassword: string,
    newPassword: string
  ) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    const isValid = await auth.verifyPassword(currentPassword, user.password);

    if (!isValid) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Current password is incorrect',
      });
    }

    const hashedPassword = await auth.hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { success: true };
  },

  deleteOwnAccount: async (userId: string) => {
    const deletedUser = await prisma.user.delete({
      where: { id: userId },
      select: SAFE_USER_SELECT,
    });

    if (!deletedUser) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return deletedUser;
  },

  getApiKeys: async (userId: string, auth: AuthManager) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        hunterApiKey: true,
        apolloApiKey: true,
        snovApiKey: true,
        hasdataApiKey: true,
        contactoutApiKey: true,
        googleMapsApiKey: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return {
      hunterApiKey: maskKey(tryDecrypt(auth, user.hunterApiKey)),
      apolloApiKey: maskKey(tryDecrypt(auth, user.apolloApiKey)),
      snovApiKey: maskKey(tryDecrypt(auth, user.snovApiKey)),
      hasdataApiKey: maskKey(tryDecrypt(auth, user.hasdataApiKey)),
      contactoutApiKey: maskKey(tryDecrypt(auth, user.contactoutApiKey)),
      googleMapsApiKey: maskKey(tryDecrypt(auth, user.googleMapsApiKey)),
    };
  },

  updateApiKeys: async (
    userId: string,
    apiKeys: {
      hunterApiKey?: string;
      googleMapsApiKey?: string;
    },
    auth: AuthManager
  ) => {
    if (apiKeys.hunterApiKey === undefined && apiKeys.googleMapsApiKey === undefined) {
      return userService.getApiKeys(userId, auth);
    }

    const updateData: any = {};
    if (apiKeys.hunterApiKey !== undefined) {
      updateData.hunterApiKey = apiKeys.hunterApiKey ? auth.encryptData(apiKeys.hunterApiKey) : null;
    }
    if (apiKeys.googleMapsApiKey !== undefined) {
      updateData.googleMapsApiKey = apiKeys.googleMapsApiKey ? auth.encryptData(apiKeys.googleMapsApiKey) : null;
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return userService.getApiKeys(userId, auth);
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

    const updated = await prisma.user.update({
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
      select: {
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        smtpFromName: true,
        smtpFromEmail: true,
      },
    });

    return updated;
  },
};

export default userService;
