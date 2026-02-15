import { TRPCError } from '@trpc/server';
import { SQL, sql } from 'bun';
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
      SELECT "hunterApiKey", "apolloApiKey", "snovApiKey", "hasdataApiKey", "contactoutApiKey"
      FROM "User"
      WHERE id = ${userId}
    ` as Promise<any[]>;

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    const sourcesMap: Record<string, string> = {
      hunterApiKey: 'HUNTER',
      apolloApiKey: 'APOLLO',
      snovApiKey: 'SNOV',
      hasdataApiKey: 'HASDATA',
      contactoutApiKey: 'CONTACTOUT',
    };

    return Object.entries(sourcesMap)
      .filter(([key]) => !!user[key])
      .map(([_, label]) => label);
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
    const conditions = [];

    if (filters?.status && filters.status !== 'all') {
      conditions.push(sql`status = ${filters.status.toUpperCase()}`);
    }
    if (filters?.role && filters.role !== 'all') {
      conditions.push(sql`role = ${filters.role.toUpperCase()}`);
    }
    if (filters?.emailVerified !== undefined) {
      conditions.push(sql`"emailVerified" = ${filters.emailVerified}`);
    }
    if (filters?.isPremium !== undefined) {
      conditions.push(sql`"isPremium" = ${filters.isPremium}`);
    }

    const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

    return await db`
      SELECT *
      FROM "User"
      ${whereClause}
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
    const updates = [];
    if (data.isPremium !== undefined) updates.push(sql`"isPremium" = ${data.isPremium}`);
    if (data.role !== undefined) updates.push(sql`role = ${data.role}`);

    if (updates.length === 0) return this.getUserById(db, userId);

    const [updatedUser] = await db`
      UPDATE "User"
      SET ${sql.join(updates, sql`, `)}, "updatedAt" = NOW()
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
      WHERE id IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})
      RETURNING id
    ` as Promise<any[]>;
    return { count: deletedUsers.length };
  },

  updateProfile: async (
    db: SQL,
    userId: string,
    data: { firstName?: string; lastName?: string }
  ) => {
    const updates = [];
    if (data.firstName !== undefined) updates.push(sql`"firstName" = ${data.firstName}`);
    if (data.lastName !== undefined) updates.push(sql`"lastName" = ${data.lastName}`);

    if (updates.length === 0) return this.getUserById(db, userId);

    const [updatedUser] = await db`
      UPDATE "User"
      SET ${sql.join(updates, sql`, `)}, "updatedAt" = NOW()
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
      apolloApiKey?: string;
      snovApiKey?: string;
      hasdataApiKey?: string;
      contactoutApiKey?: string;
    }
  ) => {
    const updates = [];
    const fields = ['hunterApiKey', 'apolloApiKey', 'snovApiKey', 'hasdataApiKey', 'contactoutApiKey'];

    for (const field of fields) {
      if (apiKeys[field as keyof typeof apiKeys] !== undefined) {
        updates.push(sql`"${sql.raw(field)}" = ${apiKeys[field as keyof typeof apiKeys] || null}`);
      }
    }

    if (updates.length === 0) return this.getUserById(db, userId);

    const [updatedUser] = await db`
      UPDATE "User"
      SET ${sql.join(updates, sql`, `)}, "updatedAt" = NOW()
      WHERE id = ${userId}
      RETURNING *
    ` as Promise<any[]>;

    return updatedUser;
  },
};

export default userService;
