import { TRPCError } from '@trpc/server';
import { type PrismaClient } from '@repo/database';
import { type AuthManager } from '@repo/auth';

export const userService = {
  getProfile: async (db: PrismaClient, userId: string) => {
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    /**
     * if
     */
    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return user;
  },

  getConfiguredSources: async (db: PrismaClient, userId: string) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        hunterApiKey: true,
        apolloApiKey: true,
        snovApiKey: true,
        hasdataApiKey: true,
        contactoutApiKey: true,
      },
    });

    /**
     * if
     */
    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    const configuredSources: string[] = [];
    /**
     * if
     */
    if (user.hunterApiKey) configuredSources.push('HUNTER');
    /**
     * if
     */
    if (user.apolloApiKey) configuredSources.push('APOLLO');
    /**
     * if
     */
    if (user.snovApiKey) configuredSources.push('SNOV');
    /**
     * if
     */
    if (user.hasdataApiKey) configuredSources.push('HASDATA');
    /**
     * if
     */
    if (user.contactoutApiKey) configuredSources.push('CONTACTOUT');

    return configuredSources;
  },

  getAllUsers: async (
    db: PrismaClient,
    filters?: {
      status?: 'all' | 'active' | 'suspended' | 'banned' | 'pending';
      role?: 'all' | 'admin' | 'user';
      emailVerified?: boolean;
      isPremium?: boolean;
    }
  ) => {
    const where: any = {};

    /**
     * if
     */
    if (filters?.status && filters.status !== 'all') {
      where.status = filters.status.toUpperCase();
    }

    /**
     * if
     */
    if (filters?.role && filters.role !== 'all') {
      where.role = filters.role.toUpperCase();
    }

    /**
     * if
     */
    if (filters?.emailVerified !== undefined) {
      where.emailVerified = filters.emailVerified;
    }

    /**
     * if
     */
    if (filters?.isPremium !== undefined) {
      where.isPremium = filters.isPremium;
    }

    return await db.user.findMany({
      where,
      include: {
        messages: { select: { id: true } },
        rooms: { select: { roomId: true } },
        subscription: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  getUserById: async (db: PrismaClient, userId: string) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        messages: {
          select: { id: true, text: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        rooms: {
          select: { roomId: true, room: { select: { name: true } } },
        },
        subscription: true,
        paymentHistory: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    /**
     * if
     */
    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return user;
  },

  getUserStats: async (db: PrismaClient) => {
    const [
      totalUsers,
      activeUsers,
      bannedUsers,
      suspendedUsers,
      premiumUsers,
      verifiedUsers,
      adminUsers,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { status: 'ACTIVE' } }),
      db.user.count({ where: { isBanned: true } }),
      db.user.count({ where: { isSuspended: true } }),
      db.user.count({ where: { isPremium: true } }),
      db.user.count({ where: { emailVerified: true } }),
      db.user.count({ where: { role: 'ADMIN' } }),
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
    db: PrismaClient,
    userId: string,
    data: { isPremium?: boolean; role?: 'USER' | 'ADMIN' }
  ) => {
    try {
      return await db.user.update({
        where: { id: userId },
        data,
      });
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update user',
      });
    }
  },

  banUser: async (db: PrismaClient, userId: string, reason: string, bannedBy: string) => {
    return await db.user.update({
      where: { id: userId },
      data: {
        isBanned: true,
        status: 'BANNED',
        banReason: reason,
        bannedAt: new Date(),
        bannedBy,
      },
    });
  },

  unbanUser: async (db: PrismaClient, userId: string) => {
    return await db.user.update({
      where: { id: userId },
      data: {
        isBanned: false,
        status: 'ACTIVE',
        banReason: null,
        bannedAt: null,
        bannedBy: null,
      },
    });
  },

  suspendUser: async (db: PrismaClient, userId: string, reason: string, until: Date) => {
    return await db.user.update({
      where: { id: userId },
      data: {
        isSuspended: true,
        status: 'SUSPENDED',
        suspensionReason: reason,
        suspendedUntil: until,
      },
    });
  },

  unsuspendUser: async (db: PrismaClient, userId: string) => {
    return await db.user.update({
      where: { id: userId },
      data: {
        isSuspended: false,
        status: 'ACTIVE',
        suspensionReason: null,
        suspendedUntil: null,
      },
    });
  },

  verifyEmail: async (db: PrismaClient, userId: string) => {
    return await db.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
  },

  deleteUser: async (db: PrismaClient, userId: string) => {
    return await db.user.delete({
      where: { id: userId },
    });
  },

  bulkDeleteUsers: async (db: PrismaClient, userIds: string[]) => {
    return await db.user.deleteMany({
      where: { id: { in: userIds } },
    });
  },

  updateProfile: async (
    db: PrismaClient,
    userId: string,
    data: { firstName?: string; lastName?: string }
  ) => {
    try {
      return await db.user.update({
        where: { id: userId },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
        },
      });
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update profile',
      });
    }
  },

  changePassword: async (
    db: PrismaClient,
    auth: AuthManager,
    userId: string,
    currentPassword: string,
    newPassword: string
  ) => {
    const user = await db.user.findUnique({ where: { id: userId } });

    /**
     * if
     */
    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    const isValid = await auth.verifyPassword(currentPassword, user.password);

    /**
     * if
     */
    if (!isValid) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Current password is incorrect',
      });
    }

    const hashedPassword = await auth.hashPassword(newPassword);

    return await db.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  },

  deleteOwnAccount: async (db: PrismaClient, userId: string) => {
    const user = await db.user.findUnique({ where: { id: userId } });

    /**
     * if
     */
    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return await db.user.delete({
      where: { id: userId },
    });
  },

  updateApiKeys: async (
    db: PrismaClient,
    userId: string,
    apiKeys: {
      hunterApiKey?: string;
      apolloApiKey?: string;
      snovApiKey?: string;
      hasdataApiKey?: string;
      contactoutApiKey?: string;
    }
  ) => {
    try {
      const updateData: any = {};

      /**
       * if
       */
      if (apiKeys.hunterApiKey !== undefined) {
        updateData.hunterApiKey = apiKeys.hunterApiKey || null;
      }
      /**
       * if
       */
      if (apiKeys.apolloApiKey !== undefined) {
        updateData.apolloApiKey = apiKeys.apolloApiKey || null;
      }
      /**
       * if
       */
      if (apiKeys.snovApiKey !== undefined) {
        updateData.snovApiKey = apiKeys.snovApiKey || null;
      }
      /**
       * if
       */
      if (apiKeys.hasdataApiKey !== undefined) {
        updateData.hasdataApiKey = apiKeys.hasdataApiKey || null;
      }
      /**
       * if
       */
      if (apiKeys.contactoutApiKey !== undefined) {
        updateData.contactoutApiKey = apiKeys.contactoutApiKey || null;
      }

      return await db.user.update({
        where: { id: userId },
        data: updateData,
      });
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update API keys',
      });
    }
  },
};

export default userService;
