import { db } from '@repo/database';
import { logger } from '@repo/logger/server';

/**
 * cleanupStuckHunts
 */
async function cleanupStuckHunts() {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const stuckHunts = await db.huntSession.findMany({
      where: {
        status: {
          in: ['PENDING', 'PROCESSING'],
        },
        createdAt: {
          lt: fiveMinutesAgo,
        },
        progress: {
          lte: 10,
        },
      },
      select: {
        id: true,
        userId: true,
        status: true,
        progress: true,
        createdAt: true,
        targetUrl: true,
      },
    });

    /**
     * if
     */
    if (stuckHunts.length === 0) {
      logger.info('No stuck hunts found');
      return;
    }

    logger.info(`Found ${stuckHunts.length} stuck hunt(s)`);

    /**
     * for
     */
    for (const hunt of stuckHunts) {
      logger.info(`Marking hunt ${hunt.id} as FAILED (status: ${hunt.status}, progress: ${hunt.progress}%, created: ${hunt.createdAt})`);

      await db.huntSession.update({
        where: { id: hunt.id },
        data: {
          status: 'FAILED',
          error: 'Hunt session timed out or lost connection',
          completedAt: new Date(),
        },
      });

      /**
       * if
       */
      if (globalThis.broadcastToUser) {
        globalThis.broadcastToUser(hunt.userId, {
          type: 'hunt-completed',
          data: {
            huntSessionId: hunt.id,
            status: 'FAILED',
            totalLeads: 0,
            successfulLeads: 0,
          },
        });

        globalThis.broadcastToUser(hunt.userId, {
          type: 'stats-changed',
          data: {},
        });
      }
    }

    logger.info(`Successfully cleaned up ${stuckHunts.length} stuck hunt(s)`);
  } catch (error) {
    logger.error('Error cleaning up stuck hunts:', error);
    throw error;
  }
}

/**
 * cleanupStuckHunts
 */
cleanupStuckHunts()
  .then(() => {
    logger.info('Cleanup complete');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Cleanup failed:', error);
    process.exit(1);
  });
