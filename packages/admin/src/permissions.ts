import { SQL, sql } from 'bun';
import type { EntityOperation, AdminPermissions, AdminContext } from './types';

export class PermissionService {
  /**
   * constructor
   */
  constructor(private db: SQL) {}

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

    const [permission] = await this.db`
      SELECT "canCreate", "canRead", "canUpdate", "canDelete"
      FROM "AdminPermission"
      WHERE "userId" = ${context.userId} AND entity = ${entity}
    ` as Promise<any[]>;

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

    const [permission] = await this.db`
      SELECT "canCreate", "canRead", "canUpdate", "canDelete"
      FROM "AdminPermission"
      WHERE "userId" = ${context.userId} AND entity = ${entity}
    ` as Promise<any[]>;

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
    await this.db`
      INSERT INTO "AdminPermission" ("userId", entity, "canCreate", "canRead", "canUpdate", "canDelete")
      VALUES (
        ${userId},
        ${entity},
        ${permissions.canCreate},
        ${permissions.canRead},
        ${permissions.canUpdate},
        ${permissions.canDelete}
      )
      ON CONFLICT ("userId", entity) DO UPDATE SET
        "canCreate" = EXCLUDED."canCreate",
        "canRead" = EXCLUDED."canRead",
        "canUpdate" = EXCLUDED."canUpdate",
        "canDelete" = EXCLUDED."canDelete"
    `;
  }

  /**
   * revokeEntityPermissions
   */
  async revokeEntityPermissions(userId: string, entity: string): Promise<void> {
    await this.db`
      DELETE FROM "AdminPermission"
      WHERE "userId" = ${userId} AND entity = ${entity}
    `;
  }

  /**
   * getAllUserPermissions
   */
  async getAllUserPermissions(userId: string) {
    return this.db`
      SELECT id, "userId", entity, "canCreate", "canRead", "canUpdate", "canDelete", "createdAt", "updatedAt"
      FROM "AdminPermission"
      WHERE "userId" = ${userId}
    ` as Promise<any[]>;
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
