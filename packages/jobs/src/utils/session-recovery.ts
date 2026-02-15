import type { PrismaClient } from '@repo/database';
import { logger } from '@repo/logger';

/**
 * recoverAbandonedSessions
 */
export async function recoverAbandonedSessions(db: PrismaClient): Promise<void> {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const abandonedAudits = await db.auditSession.updateMany({
      where: {
        status: {
          in: ['PENDING', 'PROCESSING'],
        },
        updatedAt: {
          lt: fiveMinutesAgo,
        },
      },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
      },
    });

    const abandonedHunts = await db.huntSession.updateMany({
      where: {
        status: {
          in: ['PENDING', 'PROCESSING'],
        },
        updatedAt: {
          lt: fiveMinutesAgo,
        },
      },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
      },
    });

    /**
     * if
     */
    if (abandonedAudits.count > 0 || abandonedHunts.count > 0) {
      logger.info(
        {
          auditsRecovered: abandonedAudits.count,
          huntsRecovered: abandonedHunts.count,
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
export async function reconcileActiveSessions(db: PrismaClient, activeJobIds: Set<string>): Promise<void> {
  try {
    const activeSessions = await db.auditSession.findMany({
      where: {
        status: {
          in: ['PENDING', 'PROCESSING'],
        },
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
      },
    });

    /**
     * for
     */
    for (const session of activeSessions) {
      /**
       * if
       */
      if (!activeJobIds.has(session.id)) {
        await db.auditSession.update({
          where: { id: session.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
          },
        });

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

    const activeHuntSessions = await db.huntSession.findMany({
      where: {
        status: {
          in: ['PENDING', 'PROCESSING'],
        },
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
      },
    });

    /**
     * for
     */
    for (const session of activeHuntSessions) {
      /**
       * if
       */
      if (!activeJobIds.has(session.id)) {
        await db.huntSession.update({
          where: { id: session.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
          },
        });

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
