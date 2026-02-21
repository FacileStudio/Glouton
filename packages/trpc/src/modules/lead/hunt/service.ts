import { prisma } from '@repo/database/prisma';
import type { PrismaClient, LeadSource } from '@prisma/client';
import type { QueueManager } from '@repo/jobs';
import { TRPCError } from '@trpc/server';
import type { Scope } from '../../../utils/scope';
import type { ApiKeys } from '../../../utils/api-keys';
import { buildHuntFilter } from '../../../utils/scope';
import { logger } from '@repo/logger';

export interface StartHuntParams {
  scope: Scope;
  apiKeys: ApiKeys;
  source: string;
  companyName?: string;
  speed: number;
  filters?: any;
  jobs: QueueManager;
  prisma: PrismaClient;
}

export interface StartLocalBusinessHuntParams {
  scope: Scope;
  apiKeys: ApiKeys;
  location: string;
  categories: string[];
  hasWebsite?: boolean;
  radius?: number;
  maxResults?: number;
  googleMapsApiKey?: string;
  jobs: QueueManager;
  prisma: PrismaClient;
}

export interface RunDetails {
  id: string;
  userId: string;
  status: string;
  progress: number;
  sources: string[];
  domain: string | null;
  filters: any;
  totalLeads: number;
  successfulLeads: number;
  failedLeads: number;
  sourceStats: any;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  stats: {
    totalLeads: number;
    hotLeads: number;
    warmLeads: number;
    coldLeads: number;
    contactedLeads: number;
    duration: number | null;
    successRate: number;
    averageScore: number;
  };
  leads: Array<{
    id: string;
    domain: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    businessName: string | null;
    position: string | null;
    status: string;
    score: number;
    source: string;
    createdAt: Date;
  }>;
}

export interface RunEvent {
  id: string;
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'success';
  category: 'system' | 'source' | 'lead' | 'enrichment';
  message: string;
  metadata?: any;
}

export default {
  async startHunt({
    scope,
    apiKeys,
    source,
    companyName,
    speed,
    filters,
    jobs,
    prisma,
  }: StartHuntParams) {
    const huntData: any = {
      userId: scope.userId,
      huntType: 'DOMAIN',
      sources: [source as LeadSource],
      filters: filters || {},
      status: 'PENDING',
      progress: 0,
    };

    if (scope.type === 'team') {
      huntData.teamId = scope.teamId;
      logger.info({ teamId: scope.teamId, userId: scope.userId }, '[HUNT] Starting hunt for team');
    } else {
      huntData.teamId = null;
      logger.info({ userId: scope.userId }, '[HUNT] Starting hunt for personal use');
    }

    const huntSession = await prisma.huntSession.create({
      data: huntData,
      select: {
        id: true,
        status: true,
        createdAt: true,
      }
    });

    await jobs.addJob(
      'domain-finder',
      'domain-finder',
      {
        huntSessionId: huntSession.id,
        userId: scope.userId,
        teamId: scope.type === 'team' ? scope.teamId : null,
        filters,
      }
    );

    return {
      huntSessionId: huntSession.id,
      status: huntSession.status,
      source,
      createdAt: huntSession.createdAt,
    };
  },

  async startLocalBusinessHunt({
    scope,
    apiKeys,
    location,
    categories,
    hasWebsite,
    radius,
    maxResults,
    googleMapsApiKey,
    jobs,
    prisma,
  }: StartLocalBusinessHuntParams) {
    const huntData: any = {
      userId: scope.userId,
      huntType: 'LOCAL_BUSINESS',
      sources: ['GOOGLE_MAPS', 'OPENSTREETMAP'] as LeadSource[],
      filters: {
        location,
        categories,
        hasWebsite,
        radius,
        maxResults,
        totalJobs: categories.length
      },
      status: 'PENDING',
      progress: 0,
    };

    if (scope.type === 'team') {
      huntData.teamId = scope.teamId;
      logger.info({ teamId: scope.teamId, userId: scope.userId }, '[HUNT] Starting local business hunt for team');
    } else {
      huntData.teamId = null;
      logger.info({ userId: scope.userId }, '[HUNT] Starting local business hunt for personal use');
    }

    const huntSession = await prisma.huntSession.create({
      data: huntData,
      select: {
        id: true,
        status: true,
        createdAt: true,
      }
    });

    for (const category of categories) {
      await jobs.addJob(
        'local-business-hunt',
        'local-business-hunt',
        {
          huntSessionId: huntSession.id,
          userId: scope.userId,
          teamId: scope.type === 'team' ? scope.teamId : null,
          location,
          category,
          hasWebsite,
          radius,
          maxResults: Math.floor((maxResults || 100) / categories.length),
          googleMapsApiKey,
        }
      );
    }

    return {
      huntSessionId: huntSession.id,
      status: huntSession.status,
      location,
      categories,
      createdAt: huntSession.createdAt,
    };
  },

  async getHuntSessions(scope: Scope, prisma: PrismaClient, jobs?: QueueManager) {
    const huntFilter = buildHuntFilter(scope);
    const sessions = await prisma.huntSession.findMany({
      where: huntFilter,
      orderBy: { createdAt: 'desc' }
    });

    const validatedSessions = await Promise.all(
      sessions.map(async (session) => {
        if (
          jobs &&
          session.jobId &&
          (session.status === 'PENDING' || session.status === 'PROCESSING')
        ) {
          try {
            const queue = jobs['queues'].get('leads');
            if (queue) {
              const job = await queue.getJob(session.jobId);
              if (!job) {
                const updated = await prisma.huntSession.update({
                  where: { id: session.id },
                  data: {
                    status: 'FAILED',
                    error: 'Job not found in queue (worker may have crashed)',
                    completedAt: new Date()
                  }
                });
                return updated;
              }

              const jobState = await job.getState();
              if (jobState === 'failed' || jobState === 'completed') {
                const newStatus = jobState === 'failed' ? 'FAILED' : 'COMPLETED';
                const updated = await prisma.huntSession.update({
                  where: { id: session.id },
                  data: {
                    status: newStatus,
                    error: jobState === 'failed' ? job.failedReason : null,
                    completedAt: new Date()
                  }
                });
                return updated;
              }
            }
          } catch (error) {
            console.warn(`Failed to validate hunt session ${session.id}:`, error);
          }
        }

        return session;
      })
    );

    return validatedSessions.map((session) => ({
      id: session.id,
      huntType: session.huntType,
      status: session.status,
      progress: session.progress,
      totalLeads: session.totalLeads,
      successfulLeads: session.successfulLeads,
      failedLeads: session.failedLeads,
      error: session.error,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      createdAt: session.createdAt,
      filters: session.filters,
    }));
  },

  async getHuntSessionStatus(huntSessionId: string) {
    const session = await prisma.huntSession.findUnique({
      where: { id: huntSessionId },
      select: {
        id: true,
        userId: true,
        status: true,
        progress: true,
        totalLeads: true,
        successfulLeads: true,
        failedLeads: true,
        error: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      }
    });

    if (!session) {
      throw new Error('Hunt session not found');
    }

    return session;
  },

  async cancelHunt(huntSessionId: string, userId: string, jobs: QueueManager, events?: { emit: (userId: string, type: string, data?: any) => void }) {
    const session = await prisma.huntSession.findUnique({
      where: { id: huntSessionId, userId },
      select: { id: true, jobId: true, status: true }
    });

    if (!session) {
      throw new Error('Hunt session not found or unauthorized');
    }

    if (session.status !== 'PENDING' && session.status !== 'PROCESSING') {
      if (session.status === 'COMPLETED' || session.status === 'FAILED') {
        throw new Error('Hunt session has already completed. Use delete to remove it from your history.');
      }
      throw new Error(`Hunt session cannot be cancelled in its current state (${session.status})`);
    }

    if (session.jobId) {
      const queue = jobs['queues'].get('leads');
      if (queue) {
        const job = await queue.getJob(session.jobId);
        if (job) {
          const state = await job.getState();
          if (state === 'waiting' || state === 'delayed' || state === 'active') {
            await job.remove();
          }
        }
      }
    }

    await prisma.huntSession.update({
      where: { id: huntSessionId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      }
    });

    if (events) {
      events.emit(userId, 'hunt-cancelled', {
        huntSessionId
      });
    }

    return { success: true, huntSessionId };
  },

  async deleteHunt(huntSessionId: string, userId: string) {
    const session = await prisma.huntSession.findUnique({
      where: { id: huntSessionId, userId },
      select: { id: true, status: true }
    });

    if (!session) {
      throw new Error('Hunt session not found or unauthorized');
    }

    if (session.status === 'PROCESSING') {
      throw new Error('Cannot delete a hunt session that is currently processing');
    }

    await prisma.huntSession.delete({
      where: { id: huntSessionId }
    });

    return { success: true, huntSessionId };
  },

  async getRunDetails(huntSessionId: string, userId: string): Promise<RunDetails> {
    const session = await prisma.huntSession.findUnique({
      where: { id: huntSessionId },
      include: {
        team: {
          include: {
            members: {
              where: { userId, isActive: true },
              select: { userId: true }
            }
          }
        }
      }
    });

    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Hunt session not found',
      });
    }

    const isOwner = session.userId === userId;
    const isTeamMember = session.teamId && session.team?.members.length > 0;

    if (!isOwner && !isTeamMember) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have access to this hunt session',
      });
    }

    const leads = await prisma.lead.findMany({
      where: { huntSessionId },
      select: {
        id: true,
        domain: true,
        email: true,
        firstName: true,
        lastName: true,
        businessName: true,
        position: true,
        status: true,
        score: true,
        source: true,
        contacted: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    const stats = this.calculateStats(session, leads);

    return {
      id: session.id,
      userId: session.userId,
      status: session.status,
      progress: session.progress,
      sources: session.sources,
      domain: session.domain,
      filters: session.filters,
      totalLeads: session.totalLeads,
      successfulLeads: session.successfulLeads,
      failedLeads: session.failedLeads,
      sourceStats: session.sourceStats,
      error: session.error,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      stats,
      leads: leads.map((lead) => ({
        id: lead.id,
        domain: lead.domain || '',
        email: lead.email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        businessName: lead.businessName,
        position: lead.position,
        status: lead.status,
        score: lead.score,
        source: lead.source,
        createdAt: lead.createdAt,
      })),
    };
  },

  calculateStats(session: any, leads: Array<{ status: string; score: number; contacted: boolean }>): RunDetails['stats'] {
    const hotLeads = leads.filter((l) => l.status === 'HOT').length;
    const warmLeads = leads.filter((l) => l.status === 'WARM').length;
    const coldLeads = leads.filter((l) => l.status === 'COLD').length;
    const contactedLeads = leads.filter((l) => l.contacted).length;

    let duration: number | null = null;
    if (session.startedAt && session.completedAt) {
      duration = Math.floor(
        (session.completedAt.getTime() - session.startedAt.getTime()) / 1000
      );
    }

    const successRate =
      session.totalLeads > 0
        ? Math.round((session.successfulLeads / session.totalLeads) * 100)
        : 0;

    const averageScore =
      leads.length > 0
        ? Math.round(leads.reduce((sum, lead) => sum + lead.score, 0) / leads.length)
        : 0;

    return {
      totalLeads: leads.length,
      hotLeads,
      warmLeads,
      coldLeads,
      contactedLeads,
      duration,
      successRate,
      averageScore,
    };
  },

  generateRunEvents(session: any): RunEvent[] {
    const events: RunEvent[] = [];
    let eventId = 0;

    events.push({
      id: `event-${eventId++}`,
      timestamp: session.createdAt,
      level: 'info',
      category: 'system',
      message: 'Hunt session created',
      metadata: {
        sources: session.sources,
        domain: session.domain,
      },
    });

    if (session.startedAt) {
      events.push({
        id: `event-${eventId++}`,
        timestamp: session.startedAt,
        level: 'info',
        category: 'system',
        message: 'Hunt session started',
        metadata: {
          sources: session.sources,
        },
      });
    }

    if (session.sourceStats && typeof session.sourceStats === 'object') {
      const sourceStats = session.sourceStats as Record<
        string,
        { leads: number; errors: number; rateLimited: boolean }
      >;

      for (const [source, stats] of Object.entries(sourceStats)) {
        if (stats.leads > 0) {
          events.push({
            id: `event-${eventId++}`,
            timestamp: session.startedAt || session.createdAt,
            level: 'success',
            category: 'source',
            message: `${source}: Found ${stats.leads} lead${stats.leads > 1 ? 's' : ''}`,
            metadata: { source, ...stats },
          });
        }

        if (stats.errors > 0) {
          events.push({
            id: `event-${eventId++}`,
            timestamp: session.startedAt || session.createdAt,
            level: 'error',
            category: 'source',
            message: `${source}: ${stats.errors} error${stats.errors > 1 ? 's' : ''} occurred`,
            metadata: { source, ...stats },
          });
        }

        if (stats.rateLimited) {
          events.push({
            id: `event-${eventId++}`,
            timestamp: session.startedAt || session.createdAt,
            level: 'warning',
            category: 'source',
            message: `${source}: Rate limit reached`,
            metadata: { source, ...stats },
          });
        }
      }
    }

    if (session.progress >= 90 && session.progress < 100 && session.status === 'PROCESSING') {
      events.push({
        id: `event-${eventId++}`,
        timestamp: session.updatedAt,
        level: 'info',
        category: 'enrichment',
        message: 'Website scraping and audit in progress',
        metadata: { progress: session.progress },
      });
    }

    if (session.completedAt) {
      if (session.status === 'COMPLETED') {
        events.push({
          id: `event-${eventId++}`,
          timestamp: session.completedAt,
          level: 'success',
          category: 'system',
          message: `Hunt completed successfully with ${session.successfulLeads} lead${session.successfulLeads > 1 ? 's' : ''}`,
          metadata: {
            totalLeads: session.totalLeads,
            successfulLeads: session.successfulLeads,
            failedLeads: session.failedLeads,
          },
        });
      } else if (session.status === 'FAILED') {
        events.push({
          id: `event-${eventId++}`,
          timestamp: session.completedAt,
          level: 'error',
          category: 'system',
          message: session.error || 'Hunt failed',
          metadata: {
            error: session.error,
            sourceStats: session.sourceStats,
          },
        });
      } else if (session.status === 'CANCELLED') {
        events.push({
          id: `event-${eventId++}`,
          timestamp: session.completedAt,
          level: 'warning',
          category: 'system',
          message: 'Hunt cancelled by user',
          metadata: {
            progress: session.progress,
            leadsFound: session.totalLeads,
          },
        });
      }
    }

    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  },

  async getRunEvents(
    huntSessionId: string,
    userId: string,
    options?: {
      level?: 'info' | 'warning' | 'error' | 'success';
      category?: 'system' | 'source' | 'lead' | 'enrichment';
      page?: number;
      limit?: number;
    }
  ): Promise<{ events: RunEvent[]; total: number; page: number; limit: number }> {
    const session = await prisma.huntSession.findUnique({
      where: { id: huntSessionId }
    });

    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Hunt session not found',
      });
    }

    if (session.userId !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have access to this hunt session',
      });
    }

    let events = this.generateRunEvents(session);

    if (options?.level) {
      events = events.filter((e) => e.level === options.level);
    }

    if (options?.category) {
      events = events.filter((e) => e.category === options.category);
    }

    const total = events.length;
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const offset = (page - 1) * limit;

    const paginatedEvents = events.slice(offset, offset + limit);

    return {
      events: paginatedEvents,
      total,
      page,
      limit,
    };
  },
};