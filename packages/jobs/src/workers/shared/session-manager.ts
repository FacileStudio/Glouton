import { prisma } from '@repo/database';
import type { Prisma } from '@prisma/client';

export type SessionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface SessionUpdateData {
  status?: SessionStatus;
  progress?: number;
  totalLeads?: number;
  successfulLeads?: number;
  failedLeads?: number;
  error?: string;
  sourceStats?: Prisma.InputJsonValue;
  filters?: Prisma.InputJsonValue;
}

export class SessionManager {
  async startSession(sessionId: string): Promise<void> {
    const startedAt = new Date();
    await prisma.huntSession.update({
      where: { id: sessionId },
      data: {
        status: 'PROCESSING',
        startedAt,
        updatedAt: startedAt,
      },
    });
  }

  async startAuditSession(sessionId: string, totalLeads: number): Promise<void> {
    const startedAt = new Date();
    await prisma.auditSession.update({
      where: { id: sessionId },
      data: {
        status: 'PROCESSING',
        totalLeads,
        startedAt,
        updatedAt: startedAt,
      },
    });
  }

  async updateSession(sessionId: string, data: SessionUpdateData): Promise<void> {
    await prisma.huntSession.update({
      where: { id: sessionId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async updateAuditSession(sessionId: string, data: {
    progress?: number;
    processedLeads?: number;
    updatedLeads?: number;
    failedLeads?: number;
  }): Promise<void> {
    await prisma.auditSession.update({
      where: { id: sessionId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async completeSession(
    sessionId: string,
    data: { totalLeads: number; successfulLeads: number; failedLeads?: number }
  ): Promise<void> {
    const completedAt = new Date();
    await prisma.huntSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        totalLeads: data.totalLeads,
        successfulLeads: data.successfulLeads,
        failedLeads: data.failedLeads || 0,
        completedAt,
        updatedAt: completedAt,
      },
    });
  }

  async completeAuditSession(sessionId: string): Promise<void> {
    const completedAt = new Date();
    await prisma.auditSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt,
        updatedAt: completedAt,
      },
    });
  }

  async failSession(sessionId: string, error: string): Promise<void> {
    const failedAt = new Date();
    await prisma.huntSession.update({
      where: { id: sessionId },
      data: {
        status: 'FAILED',
        error,
        completedAt: failedAt,
        updatedAt: failedAt,
      },
    });
  }

  async failAuditSession(sessionId: string, error: string): Promise<void> {
    const failedAt = new Date();
    await prisma.auditSession.update({
      where: { id: sessionId },
      data: {
        status: 'FAILED',
        error,
        completedAt: failedAt,
        updatedAt: failedAt,
      },
    });
  }

  async cancelSession(sessionId: string): Promise<void> {
    const cancelledAt = new Date();
    await prisma.huntSession.update({
      where: { id: sessionId },
      data: {
        status: 'CANCELLED',
        completedAt: cancelledAt,
        updatedAt: cancelledAt,
      },
    });
  }

  async cancelAuditSession(sessionId: string, stats: {
    processedLeads: number;
    updatedLeads: number;
    failedLeads: number;
  }): Promise<void> {
    const currentSession = await prisma.auditSession.findUnique({
      where: { id: sessionId },
      select: { status: true, completedAt: true, totalLeads: true },
    });

    if (currentSession?.status !== 'COMPLETED') {
      await prisma.auditSession.update({
        where: { id: sessionId },
        data: {
          progress: Math.floor((stats.processedLeads / (currentSession?.totalLeads || 1)) * 100),
          processedLeads: stats.processedLeads,
          updatedLeads: stats.updatedLeads,
          failedLeads: stats.failedLeads,
          completedAt: currentSession?.completedAt || new Date(),
          updatedAt: new Date(),
        },
      });
    }
  }

  async incrementSessionLeads(sessionId: string, count: number): Promise<{ totalLeads: number; successfulLeads: number }> {
    const updatedSession = await prisma.huntSession.update({
      where: { id: sessionId },
      data: {
        totalLeads: { increment: count },
        successfulLeads: { increment: count },
        updatedAt: new Date(),
      },
      select: { totalLeads: true, successfulLeads: true },
    });

    return {
      totalLeads: updatedSession.totalLeads || 0,
      successfulLeads: updatedSession.successfulLeads || 0,
    };
  }
}
