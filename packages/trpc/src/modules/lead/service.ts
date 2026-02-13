import type { PrismaClient, LeadStatus } from '@repo/database';
import { Prisma } from '@repo/database';
import type { QueueManager } from '@repo/jobs';

export interface StartHuntParams {
  userId: string;
  targetUrl: string;
  speed: number;
  jobs: QueueManager;
  db: PrismaClient;
}

export interface GetLeadsParams {
  userId: string;
  db: PrismaClient;
  filters?: {
    status?: LeadStatus;
    search?: string;
    page?: number;
    limit?: number;
  };
}

export interface LeadStats {
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  pendingHunts: number;
  processingHunts: number;
  completedHunts: number;
  failedHunts: number;
  successRate: number;
  averageScore: number;
}

export const leadService = {
  startHunt: async ({ userId, targetUrl, speed, jobs, db }: StartHuntParams) => {
    const huntSession = await db.huntSession.create({
      data: {
        userId,
        targetUrl,
        speed,
        status: 'PENDING',
        progress: 0,
      },
    });

    await jobs.addJob('leads', 'lead-extraction', {
      huntSessionId: huntSession.id,
      userId,
      targetUrl,
      speed,
    });

    return {
      huntSessionId: huntSession.id,
      status: huntSession.status,
      targetUrl: huntSession.targetUrl,
      createdAt: huntSession.createdAt,
    };
  },

  getLeads: async ({ userId, db, filters }: GetLeadsParams) => {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.LeadWhereInput = { userId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.search) {
      where.OR = [
        { domain: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [leads, total] = await Promise.all([
      db.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.lead.count({ where }),
    ]);

    return {
      leads: leads.map((lead) => ({
        id: lead.id,
        domain: lead.domain,
        email: lead.email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        status: lead.status,
        score: lead.score,
        technologies: lead.technologies,
        huntSessionId: lead.huntSessionId,
        createdAt: lead.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  getHuntSessions: async (userId: string, db: PrismaClient) => {
    const sessions = await db.huntSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      targetUrl: session.targetUrl,
      speed: session.speed,
      status: session.status,
      progress: session.progress,
      totalLeads: session.totalLeads,
      successfulLeads: session.successfulLeads,
      failedLeads: session.failedLeads,
      error: session.error,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      createdAt: session.createdAt,
    }));
  },

  getHuntSessionStatus: async (huntSessionId: string, db: PrismaClient) => {
    const session = await db.huntSession.findUnique({
      where: { id: huntSessionId },
    });

    if (!session) {
      throw new Error('Hunt session not found');
    }

    return {
      id: session.id,
      targetUrl: session.targetUrl,
      status: session.status,
      progress: session.progress,
      totalLeads: session.totalLeads,
      successfulLeads: session.successfulLeads,
      failedLeads: session.failedLeads,
      error: session.error,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      createdAt: session.createdAt,
    };
  },

  deleteLead: async (leadId: string, userId: string, db: PrismaClient) => {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    if (lead.userId !== userId) {
      throw new Error('Unauthorized to delete this lead');
    }

    await db.lead.delete({
      where: { id: leadId },
    });

    return {
      id: lead.id,
      deleted: true,
    };
  },

  getStats: async (userId: string, db: PrismaClient): Promise<LeadStats> => {
    const [
      totalLeads,
      hotLeads,
      warmLeads,
      coldLeads,
      pendingHunts,
      processingHunts,
      completedHunts,
      failedHunts,
      scoreAggregation,
    ] = await Promise.all([
      db.lead.count({ where: { userId } }),
      db.lead.count({ where: { userId, status: 'HOT' } }),
      db.lead.count({ where: { userId, status: 'WARM' } }),
      db.lead.count({ where: { userId, status: 'COLD' } }),
      db.huntSession.count({ where: { userId, status: 'PENDING' } }),
      db.huntSession.count({ where: { userId, status: 'PROCESSING' } }),
      db.huntSession.count({ where: { userId, status: 'COMPLETED' } }),
      db.huntSession.count({ where: { userId, status: 'FAILED' } }),
      db.lead.aggregate({
        where: { userId },
        _avg: { score: true },
      }),
    ]);

    const totalHunts = completedHunts + failedHunts;
    const successRate = totalHunts > 0 ? (completedHunts / totalHunts) * 100 : 0;

    return {
      totalLeads,
      hotLeads,
      warmLeads,
      coldLeads,
      pendingHunts,
      processingHunts,
      completedHunts,
      failedHunts,
      successRate: Math.round(successRate * 10) / 10,
      averageScore: Math.round((scoreAggregation._avg.score ?? 0) * 10) / 10,
    };
  },
};

export default leadService;
