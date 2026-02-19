import { SQL, sql } from 'bun';
import type { AuditLogEntry } from './types';

function sqlJoin(fragments: any[], separator: any): any {
  return fragments.reduce((acc: any, item: any, i: number) =>
    i === 0 ? item : sql`${acc}${separator}${item}`
  );
}

export class AuditService {
  /**
   * constructor
   */
  constructor(private db: SQL) {}

  /**
   * log
   */
  async log(entry: AuditLogEntry): Promise<void> {
    await this.db`
      INSERT INTO "AuditLog" ("userId", entity, "entityId", action, changes, "ipAddress", "userAgent", "createdAt")
      VALUES (
        ${entry.userId},
        ${entry.entity},
        ${entry.entityId},
        ${entry.action},
        ${entry.changes ? JSON.stringify(entry.changes) : null}::jsonb,
        ${entry.ipAddress ?? null},
        ${entry.userAgent ?? null},
        ${new Date()}
      )
    `;
  }

  /**
   * getEntityLogs
   */
  async getEntityLogs(entity: string, entityId: string) {
    return this.db`
      SELECT
        "AuditLog".id,
        "AuditLog"."userId",
        "AuditLog".entity,
        "AuditLog"."entityId",
        "AuditLog".action,
        "AuditLog".changes,
        "AuditLog"."ipAddress",
        "AuditLog"."userAgent",
        "AuditLog"."createdAt",
        "User".id AS "user_id",
        "User".email AS "user_email",
        "User"."firstName" AS "user_firstName",
        "User"."lastName" AS "user_lastName"
      FROM "AuditLog"
      JOIN "User" ON "AuditLog"."userId" = "User".id
      WHERE "AuditLog".entity = ${entity} AND "AuditLog"."entityId" = ${entityId}
      ORDER BY "AuditLog"."createdAt" DESC
    ` as Promise<any[]>;
  }

  /**
   * getUserLogs
   */
  async getUserLogs(userId: string, limit = 100) {
    return this.db`
      SELECT id, "userId", entity, "entityId", action, changes, "ipAddress", "userAgent", "createdAt"
      FROM "AuditLog"
      WHERE "userId" = ${userId}
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    ` as Promise<any[]>;
  }

  /**
   * getAllLogs
   */
  async getAllLogs(options: {
    entity?: string;
    userId?: string;
    action?: 'CREATE' | 'UPDATE' | 'DELETE';
    limit?: number;
    offset?: number;
  } = {}) {
    const { entity, userId, action, limit = 100, offset = 0 } = options;

    const conditions = [];

    if (entity) {
      conditions.push(sql`"AuditLog".entity = ${entity}`);
    }
    if (userId) {
      conditions.push(sql`"AuditLog"."userId" = ${userId}`);
    }
    if (action) {
      conditions.push(sql`"AuditLog".action = ${action}`);
    }

    const whereClause = conditions.length > 0 ? sql`WHERE ${sqlJoin(conditions, sql` AND `)}` : sql``;

    return this.db`
      SELECT
        "AuditLog".id,
        "AuditLog"."userId",
        "AuditLog".entity,
        "AuditLog"."entityId",
        "AuditLog".action,
        "AuditLog".changes,
        "AuditLog"."ipAddress",
        "AuditLog"."userAgent",
        "AuditLog"."createdAt",
        "User".id AS "user_id",
        "User".email AS "user_email",
        "User"."firstName" AS "user_firstName",
        "User"."lastName" AS "user_lastName"
      FROM "AuditLog"
      JOIN "User" ON "AuditLog"."userId" = "User".id
      ${whereClause}
      ORDER BY "AuditLog"."createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    ` as Promise<any[]>;
  }

  /**
   * countLogs
   */
  async countLogs(options: {
    entity?: string;
    userId?: string;
    action?: 'CREATE' | 'UPDATE' | 'DELETE';
  } = {}) {
    const { entity, userId, action } = options;

    const conditions = [];

    if (entity) {
      conditions.push(sql`entity = ${entity}`);
    }
    if (userId) {
      conditions.push(sql`"userId" = ${userId}`);
    }
    if (action) {
      conditions.push(sql`action = ${action}`);
    }

    const whereClause = conditions.length > 0 ? sql`WHERE ${sqlJoin(conditions, sql` AND `)}` : sql``;

    const result = await this.db`
      SELECT COUNT(*) as count
      FROM "AuditLog"
      ${whereClause}
    ` as Promise<[{ count: number }]>;
    return result[0].count;
  }
}
