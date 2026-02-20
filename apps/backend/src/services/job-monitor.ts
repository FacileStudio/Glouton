import type { PrismaClient } from '@prisma/client';
import type { QueueManager } from '@repo/jobs';

export async function checkOrphanedSessions(prisma: PrismaClient, jobs: QueueManager) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const orphanedAudits = await prisma.auditSession.updateMany({
    where: {
      status: { in: ['PENDING', 'PROCESSING'] },
      jobId: null,
      createdAt: { lt: fiveMinutesAgo }
    },
    data: {
      status: 'FAILED',
      error: 'Session orphaned',
      completedAt: new Date()
    }
  });

  const orphanedHunts = await prisma.huntSession.updateMany({
    where: {
      status: { in: ['PENDING', 'PROCESSING'] },
      jobId: null,
      createdAt: { lt: fiveMinutesAgo }
    },
    data: {
      status: 'FAILED',
      error: 'Session orphaned',
      completedAt: new Date()
    }
  });

  return {
    audits: orphanedAudits.count,
    hunts: orphanedHunts.count,
  };
}

export async function syncJobState(
  prisma: PrismaClient,
  jobs: QueueManager,
  sessionType: 'audit' | 'hunt',
  sessionId: string,
  jobId: string
): Promise<boolean> {
  const job = await jobs.getJob('leads', jobId);
  if (!job) {
    const updateData = {
      status: 'FAILED' as const,
      error: 'Job not found',
      completedAt: new Date()
    };

    if (sessionType === 'audit') {
      await prisma.auditSession.update({
        where: { id: sessionId },
        data: updateData
      });
    } else {
      await prisma.huntSession.update({
        where: { id: sessionId },
        data: updateData
      });
    }
    return false;
  }

  const state = await job.getState();

  if (state === 'completed' || state === 'failed') {
    const status = state === 'completed' ? 'COMPLETED' : 'FAILED';
    const error = state === 'failed' ? job.failedReason : null;

    const updateData = {
      status: status as 'COMPLETED' | 'FAILED',
      error: error,
      completedAt: new Date()
    };

    if (sessionType === 'audit') {
      await prisma.auditSession.update({
        where: { id: sessionId },
        data: updateData
      });
    } else {
      await prisma.huntSession.update({
        where: { id: sessionId },
        data: updateData
      });
    }
    return true;
  }

  return false;
}

export async function cleanupStalled(prisma: PrismaClient) {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  const stalledAudits = await prisma.auditSession.updateMany({
    where: {
      status: 'PROCESSING',
      updatedAt: { lt: thirtyMinutesAgo }
    },
    data: {
      status: 'FAILED',
      error: 'Session stalled',
      completedAt: new Date()
    }
  });

  const stalledHunts = await prisma.huntSession.updateMany({
    where: {
      status: 'PROCESSING',
      updatedAt: { lt: thirtyMinutesAgo }
    },
    data: {
      status: 'FAILED',
      error: 'Session stalled',
      completedAt: new Date()
    }
  });

  return {
    audits: stalledAudits.count,
    hunts: stalledHunts.count,
  };
}