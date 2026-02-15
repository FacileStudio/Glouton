import type { PrismaClient } from '@repo/database';
import type { EntityOperation, AdminPermissions, AdminContext } from './types';

export class PermissionService {
  /**
   * constructor
   */
  constructor(private db: PrismaClient) {}

  /**
   * checkPermission
   */
  async checkPermission(
    context: AdminContext,
    entity: string,
    operation: EntityOperation
  ): Promise<boolean> {
    /**
     * if
     */
    if (context.role === 'ADMIN') {
      return true;
    }

    const permission = await this.db.adminPermission.findUnique({
      where: {
        userId_entity: {
          userId: context.userId,
          entity,
        },
      },
    });

    /**
     * if
     */
    if (!permission) {
      return false;
    }

    const operationMap = {
      create: permission.canCreate,
      read: permission.canRead,
      update: permission.canUpdate,
      delete: permission.canDelete,
    };

    return operationMap[operation] || false;
  }

  /**
   * getEntityPermissions
   */
  async getEntityPermissions(
    context: AdminContext,
    entity: string
  ): Promise<AdminPermissions> {
    /**
     * if
     */
    if (context.role === 'ADMIN') {
      return {
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
      };
    }

    const permission = await this.db.adminPermission.findUnique({
      where: {
        userId_entity: {
          userId: context.userId,
          entity,
        },
      },
    });

    /**
     * if
     */
    if (!permission) {
      return {
        canCreate: false,
        canRead: false,
        canUpdate: false,
        canDelete: false,
      };
    }

    return {
      canCreate: permission.canCreate,
      canRead: permission.canRead,
      canUpdate: permission.canUpdate,
      canDelete: permission.canDelete,
    };
  }

  /**
   * setEntityPermissions
   */
  async setEntityPermissions(
    userId: string,
    entity: string,
    permissions: AdminPermissions
  ): Promise<void> {
    await this.db.adminPermission.upsert({
      where: {
        userId_entity: {
          userId,
          entity,
        },
      },
      create: {
        userId,
        entity,
        ...permissions,
      },
      update: permissions,
    });
  }

  /**
   * revokeEntityPermissions
   */
  async revokeEntityPermissions(userId: string, entity: string): Promise<void> {
    await this.db.adminPermission.delete({
      where: {
        userId_entity: {
          userId,
          entity,
        },
      },
    });
  }

  /**
   * getAllUserPermissions
   */
  async getAllUserPermissions(userId: string) {
    return this.db.adminPermission.findMany({
      where: { userId },
    });
  }

  /**
   * requirePermission
   */
  async requirePermission(
    context: AdminContext,
    entity: string,
    operation: EntityOperation
  ): Promise<void> {
    const hasPermission = await this.checkPermission(context, entity, operation);
    /**
     * if
     */
    if (!hasPermission) {
      throw new Error(
        `Permission denied: User ${context.userId} cannot ${operation} ${entity}`
      );
    }
  }
}
