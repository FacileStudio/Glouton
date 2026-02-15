import { db } from '@repo/database';

/**
 * cancelStuckAudits
 */
async function cancelStuckAudits() {
  try {
    const stuckSessions = await db.auditSession.findMany({
      where: {
        status: {
          in: ['PENDING', 'PROCESSING'],
        },
      },
      select: {
        id: true,
        status: true,
        totalLeads: true,
        processedLeads: true,
        createdAt: true,
      },
    });

    console.log(`Found ${stuckSessions.length} stuck audit sessions`);

    /**
     * for
     */
    for (const session of stuckSessions) {
      console.log(`Cancelling session ${session.id}:`, {
        status: session.status,
        totalLeads: session.totalLeads,
        processedLeads: session.processedLeads,
        createdAt: session.createdAt,
      });

      await db.auditSession.update({
        where: { id: session.id },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
        },
      });
    }

    console.log('All stuck audit sessions cancelled');
  } catch (error) {
    console.error('Error cancelling stuck audits:', error);
  } finally {
    await db.$disconnect();
  }
}

/**
 * cancelStuckAudits
 */
cancelStuckAudits();
