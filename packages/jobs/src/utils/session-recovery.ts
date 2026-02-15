import type { SQL } from 'bun';
import { logger } from '@repo/logger';

/**
 * recoverAbandonedSessions
 */
export async function recoverAbandonedSessions(db: SQL): Promise<void> {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const abandonedAudits = await db`
      UPDATE "AuditSession"
      SET status = 'FAILED',
          "completedAt" = ${new Date()}
      WHERE status IN ('PENDING', 'PROCESSING')
        AND "updatedAt" < ${fiveMinutesAgo}
      RETURNING id
    ` as Promise<any[]>;

    const abandonedHunts = await db`
      UPDATE "HuntSession"
      SET status = 'FAILED',
          "completedAt" = ${new Date()}
      WHERE status IN ('PENDING', 'PROCESSING')
        AND "updatedAt" < ${fiveMinutesAgo}
      RETURNING id
    ` as Promise<any[]>;

    /**
     * if
     */
    if (abandonedAudits.length > 0 || abandonedHunts.length > 0) {
      logger.info(
        {
          auditsRecovered: abandonedAudits.length,
          huntsRecovered: abandonedHunts.length,
        },
        '[RECOVERY] Marked abandoned sessions as FAILED'
      );
    } else {
      logger.info('[RECOVERY] No abandoned sessions found');
    }
  } catch (error) {
    logger.error({ error }, '[RECOVERY] Failed to recover abandoned sessions');
  }
}

/**
 * reconcileActiveSessions
 */
export async function reconcileActiveSessions(db: SQL, activeJobIds: Set<string>): Promise<void> {
  try {
    const activeSessions = await db`
      SELECT id, status, "createdAt"
      FROM "AuditSession"
      WHERE status IN ('PENDING', 'PROCESSING')
    ` as Promise<any[]>;

    /**
     * for
     */
    for (const session of activeSessions) {
      /**
       * if
       */
      if (!activeJobIds.has(session.id)) {
        await db`
          UPDATE "AuditSession"
          SET status = 'FAILED',
              "completedAt" = ${new Date()}
          WHERE id = ${session.id}
        `;

        logger.warn(
          {
            sessionId: session.id,
            status: session.status,
            age: Date.now() - session.createdAt.getTime(),
          },
          '[RECOVERY] Marked orphaned audit session as FAILED'
        );
      }
    }

    const activeHuntSessions = await db`
      SELECT id, status, "createdAt"
      FROM "HuntSession"
      WHERE status IN ('PENDING', 'PROCESSING')
    ` as Promise<any[]>;

    /**
     * for
     */
    for (const session of activeHuntSessions) {
      /**
       * if
       */
      if (!activeJobIds.has(session.id)) {
        await db`
          UPDATE "HuntSession"
          SET status = 'FAILED',
              "completedAt" = ${new Date()}
          WHERE id = ${session.id}
        `;

        logger.warn(
          {
            sessionId: session.id,
            status: session.status,
            age: Date.now() - session.createdAt.getTime(),
          },
          '[RECOVERY] Marked orphaned hunt session as FAILED'
        );
      }
    }
  } catch (error) {
    logger.error({ error }, '[RECOVERY] Failed to reconcile active sessions');
  }
}
