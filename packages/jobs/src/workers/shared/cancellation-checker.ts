import type { Job } from 'bullmq';
import { prisma } from '@repo/database';

export class CancellationChecker {
  async checkHuntCancellation(job: Job): Promise<boolean> {
    return await job.isFailed();
  }

  async checkAuditCancellation(sessionId: string, job: Job): Promise<boolean> {
    const session = await prisma.auditSession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });

    if (session && session.status === 'CANCELLED') {
      return true;
    }

    if ((await job.isFailed()) || (await job.isCompleted())) {
      return true;
    }

    return false;
  }
}
