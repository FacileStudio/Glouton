import { TRPCError } from '@trpc/server';
import { SQL } from 'bun';
import { type AuthManager } from '@repo/auth';

export const userService = {
  getProfile: async (db: SQL, userId: string) => {
    const [user] = await db`
      SELECT *
      FROM "User"
      WHERE id = ${userId}
    ` as Promise<any[]>;

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return user;
  },

  getConfiguredSources: async (db: SQL, userId: string) => {
    const [user] = await db`
      SELECT "hunterApiKey"
      FROM "User"
      WHERE id = ${userId}
    ` as Promise<any[]>;

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    const sources: string[] = [];
    if (user.hunterApiKey) sources.push('HUNTER');
    return sources;
  },

  getAllUsers: async (
    db: SQL,
    filters?: {
      status?: 'all' | 'active' | 'suspended' | 'banned' | 'pending';
      role?: 'all' | 'admin' | 'user';
      emailVerified?: boolean;
      isPremium?: boolean;
    }
  ) => {
    const statusFilter = filters?.status && filters.status !== 'all' ? filters.status.toUpperCase() : null;
    const roleFilter = filters?.role && filters.role !== 'all' ? filters.role.toUpperCase() : null;
    const emailVerified = filters?.emailVerified !== undefined ? filters.emailVerified : null;
    const isPremiumFilter = filters?.isPremium !== undefined ? filters.isPremium : null;

    return await db`
      SELECT *
      FROM "User"
      WHERE
        (${statusFilter}::text IS NULL OR status::text = ${statusFilter}::text)
        AND (${roleFilter}::text IS NULL OR role::text = ${roleFilter}::text)
        AND (${emailVerified}::boolean IS NULL OR "emailVerified" = ${emailVerified})
        AND (${isPremiumFilter}::boolean IS NULL OR "isPremium" = ${isPremiumFilter})
      ORDER BY "createdAt" DESC
    ` as Promise<any[]>;
  },

  getUserById: async (db: SQL, userId: string) => {
    const [user] = await db`
      SELECT *
      FROM "User"
      WHERE id = ${userId}
    ` as Promise<any[]>;

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return user;
  },

  getUserStats: async (db: SQL) => {
    const [stats] = await db`
      SELECT 
        COUNT(*)::int as "totalUsers",
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::int as "activeUsers",
        COUNT(*) FILTER (WHERE "isBanned" = TRUE)::int as "bannedUsers",
        COUNT(*) FILTER (WHERE "isSuspended" = TRUE)::int as "suspendedUsers",
        COUNT(*) FILTER (WHERE "isPremium" = TRUE)::int as "premiumUsers",
        COUNT(*) FILTER (WHERE "emailVerified" = TRUE)::int as "verifiedUsers",
        COUNT(*) FILTER (WHERE role = 'ADMIN')::int as "adminUsers"
      FROM "User"
    ` as Promise<any[]>;

    return stats || {
      totalUsers: 0,
      activeUsers: 0,
      bannedUsers: 0,
      suspendedUsers: 0,
      premiumUsers: 0,
      verifiedUsers: 0,
      adminUsers: 0,
    };
  },

  updateUser: async (
    db: SQL,
    userId: string,
    data: { isPremium?: boolean; role?: 'USER' | 'ADMIN' }
  ) => {
    if (data.isPremium === undefined && data.role === undefined) {
      return userService.getUserById(db, userId);
    }

    const isPremium = data.isPremium !== undefined ? data.isPremium : null;
    const role = data.role !== undefined ? data.role : null;

    const [updatedUser] = await db`
      UPDATE "User"
      SET
        "isPremium" = CASE WHEN ${isPremium}::boolean IS NOT NULL THEN ${isPremium} ELSE "isPremium" END,
        role = CASE WHEN ${role}::text IS NOT NULL THEN ${role}::"UserRole" ELSE role END,
        "updatedAt" = NOW()
      WHERE id = ${userId}
      RETURNING *
    ` as Promise<any[]>;

    if (!updatedUser) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    return updatedUser;
  },

  banUser: async (db: SQL, userId: string, reason: string, bannedBy: string) => {
    const [bannedUser] = await db`
      UPDATE "User"
      SET "isBanned" = TRUE,
          status = 'BANNED',
          "banReason" = ${reason},
          "bannedAt" = NOW(),
          "bannedBy" = ${bannedBy},
          "updatedAt" = NOW()
      WHERE id = ${userId}
      RETURNING *
    ` as Promise<any[]>;
    return bannedUser;
  },

  unbanUser: async (db: SQL, userId: string) => {
    const [unbannedUser] = await db`
      UPDATE "User"
      SET "isBanned" = FALSE,
          status = 'ACTIVE',
          "banReason" = NULL,
          "bannedAt" = NULL,
          "bannedBy" = NULL,
          "updatedAt" = NOW()
      WHERE id = ${userId}
      RETURNING *
    ` as Promise<any[]>;
    return unbannedUser;
  },

  suspendUser: async (db: SQL, userId: string, reason: string, until: Date) => {
    const [suspendedUser] = await db`
      UPDATE "User"
      SET "isSuspended" = TRUE,
          status = 'SUSPENDED',
          "suspensionReason" = ${reason},
          "suspendedUntil" = ${until},
          "updatedAt" = NOW()
      WHERE id = ${userId}
      RETURNING *
    ` as Promise<any[]>;
    return suspendedUser;
  },

  unsuspendUser: async (db: SQL, userId: string) => {
    const [unsuspendedUser] = await db`
      UPDATE "User"
      SET "isSuspended" = FALSE,
          status = 'ACTIVE',
          "suspensionReason" = NULL,
          "suspendedUntil" = NULL,
          "updatedAt" = NOW()
      WHERE id = ${userId}
      RETURNING *
    ` as Promise<any[]>;
    return unsuspendedUser;
  },

  verifyEmail: async (db: SQL, userId: string) => {
    const [verifiedUser] = await db`
      UPDATE "User"
      SET "emailVerified" = TRUE, "updatedAt" = NOW()
      WHERE id = ${userId}
      RETURNING *
    ` as Promise<any[]>;
    return verifiedUser;
  },

  deleteUser: async (db: SQL, userId: string) => {
    const [deletedUser] = await db`
      DELETE FROM "User"
      WHERE id = ${userId}
      RETURNING *
    ` as Promise<any[]>;
    return deletedUser;
  },

  bulkDeleteUsers: async (db: SQL, userIds: string[]) => {
    if (userIds.length === 0) return { count: 0 };
    const deletedUsers = await db`
      DELETE FROM "User"
      WHERE id = ANY(${userIds}::text[])
      RETURNING id
    ` as Promise<any[]>;
    return { count: deletedUsers.length };
  },

  updateProfile: async (
    db: SQL,
    userId: string,
    data: { firstName?: string; lastName?: string }
  ) => {
    if (data.firstName === undefined && data.lastName === undefined) {
      return userService.getUserById(db, userId);
    }

    const firstName = data.firstName !== undefined ? data.firstName : null;
    const lastName = data.lastName !== undefined ? data.lastName : null;

    const [updatedUser] = await db`
      UPDATE "User"
      SET
        "firstName" = CASE WHEN ${firstName}::text IS NOT NULL THEN ${firstName} ELSE "firstName" END,
        "lastName" = CASE WHEN ${lastName}::text IS NOT NULL THEN ${lastName} ELSE "lastName" END,
        "updatedAt" = NOW()
      WHERE id = ${userId}
      RETURNING *
    ` as Promise<any[]>;
    return updatedUser;
  },

  changePassword: async (
    db: SQL,
    auth: AuthManager,
    userId: string,
    currentPassword: string,
    newPassword: string
  ) => {
    const user = await this.getUserById(db, userId);
    const isValid = await auth.verifyPassword(currentPassword, user.password);

    if (!isValid) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Current password is incorrect',
      });
    }

    const hashedPassword = await auth.hashPassword(newPassword);

    const [updatedUser] = await db`
      UPDATE "User"
      SET password = ${hashedPassword}, "updatedAt" = NOW()
      WHERE id = ${userId}
      RETURNING *
    ` as Promise<any[]>;
    return updatedUser;
  },

  deleteOwnAccount: async (db: SQL, userId: string) => {
    const [deletedUser] = await db`
      DELETE FROM "User"
      WHERE id = ${userId}
      RETURNING *
    ` as Promise<any[]>;

    if (!deletedUser) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return deletedUser;
  },

  updateApiKeys: async (
    db: SQL,
    userId: string,
    apiKeys: {
      hunterApiKey?: string;
    }
  ) => {
    if (apiKeys.hunterApiKey === undefined) {
      return userService.getUserById(db, userId);
    }

    const [updatedUser] = await db`
      UPDATE "User"
      SET "hunterApiKey" = ${apiKeys.hunterApiKey || null}, "updatedAt" = NOW()
      WHERE id = ${userId}
      RETURNING *
    ` as Promise<any[]>;

    return updatedUser;
  },
};

export default userService;
