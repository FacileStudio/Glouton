import { prisma } from '@repo/database/prisma';
import type { QueueManager } from '@repo/jobs';
import { buildAuditFilter, type Scope } from '../../../utils/scope';
import { logger } from '@repo/logger';

export interface ListAuditParams {
  leadId?: string;
  limit?: number;
  offset?: number;
}

export interface AuditContext {
  user: { id: string };
  jobs: QueueManager;
  log: {
    info: (data: any) => void;
    error: (data: any) => void;
  };
  events?: {
    emit: (userId: string, type: string, data?: any) => void;
  };
  prisma: any;
}

export default {
  async list(scope: Scope, input: ListAuditParams, ctx: AuditContext) {
    try {
      const { leadId, limit = 10, offset = 0 } = input;
      const baseFilter = buildAuditFilter(scope);

      const where = {
        ...baseFilter,
        ...(leadId && { leadId }),
      };

      const [auditSessions, totalAuditSessions] = await Promise.all([
        ctx.prisma.auditSession.findMany({
          where,
          include: {
            lead: {
              select: {
                id: true,
                domain: true,
                email: true,
                firstName: true,
                lastName: true,
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        ctx.prisma.auditSession.count({ where }),
      ]);

      return {
        auditSessions,
        totalAuditSessions,
      };
    } catch (error) {
      ctx.log.error({ action: 'list-audit-sessions-failed', error });
      throw new Error('Failed to retrieve audit sessions');
    }
  },

  async cancel(auditSessionId: string, ctx: AuditContext) {
    try {
      const session = await prisma.auditSession.findUnique({
        where: { id: auditSessionId, userId: ctx.user.id },
        select: { id: true, jobId: true, status: true, teamId: true }
      });

      if (!session) {
        throw new Error('Audit session not found or unauthorized');
      }

      if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
        return { success: true, auditSessionId: session.id, status: session.status };
      }

      const result = await prisma.auditSession.update({
        where: { id: auditSessionId },
        data: {
          status: 'CANCELLED',
          completedAt: new Date()
        },
        select: {
          id: true,
          processedLeads: true,
          updatedLeads: true,
          failedLeads: true,
          totalLeads: true
        }
      });

      if (session.jobId) {
        const queue = ctx.jobs['queues'].get('leads');
        if (queue) {
          const job = await queue.getJob(session.jobId);
          if (job) {
            const state = await job.getState();
            if (state === 'waiting' || state === 'delayed') {
              await job.remove().catch(() => {
                ctx.log.info({ action: 'job-actively-processing', jobId: session.jobId });
              });
            }
          }
        }
      }

      if (ctx.events) {
        const scope: { type: 'personal' | 'team'; userId: string; teamId?: string } = session.teamId
          ? { type: 'team', userId: ctx.user.id, teamId: session.teamId }
          : { type: 'personal', userId: ctx.user.id };
        await ctx.events.emitToScope(scope, 'audit-cancelled', {
          auditSessionId: result.id,
          processedLeads: result.processedLeads || 0,
          updatedLeads: result.updatedLeads || 0,
          failedLeads: result.failedLeads || 0,
          totalLeads: result.totalLeads || 0
        });
      }

      ctx.log.info({ action: 'audit-cancelled', auditSessionId: result.id });

      return { success: true, auditSessionId: result.id };
    } catch (error) {
      ctx.log.error({ action: 'cancel-audit-session-failed', error });
      throw error instanceof Error ? error : new Error('Failed to cancel audit session');
    }
  },

  async start(scope: Scope, ctx: AuditContext) {
    const userId = scope.userId;
    const jobs = ctx.jobs;
    const auditFilter = buildAuditFilter(scope);

    const existingSessions = await ctx.prisma.auditSession.findMany({
      where: {
        ...auditFilter,
        status: { in: ['PENDING', 'PROCESSING'] }
      },
      select: { id: true, jobId: true }
    });

    for (const session of existingSessions) {
      try {
        await ctx.prisma.auditSession.update({
          where: { id: session.id },
          data: {
            status: 'CANCELLED',
            completedAt: new Date()
          }
        });

        if (session.jobId) {
          const queue = jobs['queues'].get('leads');
          if (queue) {
            const job = await queue.getJob(session.jobId);
            if (job) await job.remove().catch(() => {});
          }
        }
      } catch (error) {
        console.warn(`[Audit] Failed cleanup for session ${session.id}:`, error);
      }
    }

    const auditData: any = {
      userId,
      status: 'PENDING',
      progress: 0,
    };

    if (scope.type === 'team') {
      auditData.teamId = scope.teamId;
      logger.info({ teamId: scope.teamId, userId }, '[AUDIT] Starting audit for team');
    } else {
      auditData.teamId = null;
      logger.info({ userId }, '[AUDIT] Starting audit for personal use');
    }

    const auditSession = await ctx.prisma.auditSession.create({
      data: auditData,
      select: {
        id: true,
        status: true,
        createdAt: true
      }
    });

    try {
      const job = await jobs.addJob(
        'lead-audit',
        'lead-audit',
        {
          auditSessionId: auditSession.id,
          userId,
          teamId: scope.type === 'team' ? scope.teamId : null,
        }
      );

      await ctx.prisma.$transaction([
        ctx.prisma.auditSession.updateMany({
          where: {
            jobId: job.id,
            id: { not: auditSession.id }
          },
          data: { jobId: null }
        }),
        ctx.prisma.auditSession.update({
          where: { id: auditSession.id },
          data: { jobId: job.id }
        })
      ]);

      if (ctx.events) {
        await ctx.events.emitToScope(scope, 'audit-started', {
          auditSessionId: auditSession.id,
          status: 'PENDING',
          progress: 0,
          totalLeads: 0,
          processedLeads: 0,
          updatedLeads: 0,
          failedLeads: 0,
        });
      }

      return {
        auditSessionId: auditSession.id,
        status: auditSession.status,
        createdAt: auditSession.createdAt,
      };
    } catch (error) {
      await ctx.prisma.auditSession.update({
        where: { id: auditSession.id },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Failed to start audit job',
          completedAt: new Date()
        }
      });
      throw error;
    }
  },

  async getAuditSession(auditSessionId: string, userId: string) {
    const session = await prisma.auditSession.findUnique({
      where: { id: auditSessionId, userId }
    });

    if (!session) {
      throw new Error('Audit session not found or unauthorized');
    }

    return session;
  },

  async updateAuditProgress(
    auditSessionId: string,
    progress: number,
    processedLeads: number,
    updatedLeads: number,
    failedLeads: number,
    currentDomain: string | null
  ) {
    await prisma.auditSession.update({
      where: { id: auditSessionId },
      data: {
        progress,
        processedLeads,
        updatedLeads,
        failedLeads,
        currentDomain,
      }
    });
  },

  async completeAudit(
    auditSessionId: string,
    status: 'COMPLETED' | 'FAILED',
    error: string | null
  ) {
    await prisma.auditSession.update({
      where: { id: auditSessionId },
      data: {
        status,
        error,
        completedAt: new Date(),
      }
    });
  },
};

