import { SQL, sql } from 'bun';
import type { QueueManager } from '@repo/jobs';
import { TRPCError } from '@trpc/server';

export interface StartHuntParams {
  userId: string;
  source: string;
  targetUrl?: string;
  companyName?: string;
  speed: number;
  filters?: any;
  jobs: QueueManager;
  db: SQL;
}

export interface StartLocalBusinessHuntParams {
  userId: string;
  location: string;
  categories: string[];
  hasWebsite?: boolean;
  radius?: number;
  maxResults?: number;
  googleMapsApiKey?: string;
  jobs: QueueManager;
  db: SQL;
}

export interface RunDetails {
  id: string;
  userId: string;
  status: string;
  progress: number;
  sources: string[];
  targetUrl: string | null;
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
    userId,
    source,
    targetUrl,
    companyName,
    speed,
    filters,
    jobs,
    db,
  }: StartHuntParams) {
    const [user] = (await db`
      SELECT id FROM "User" WHERE id = ${userId}
    `) as any[];

    if (!user) {
      throw new Error('User not found. Please log in again.');
    }

    const [huntSession] = (await db`
      INSERT INTO "HuntSession" (
        "userId", "huntType", sources, "targetUrl", filters, status, progress, "createdAt", "updatedAt"
      ) VALUES (
        ${userId},
        'DOMAIN',
        ${JSON.stringify([source])}::jsonb,
        ${targetUrl ?? null},
        ${JSON.stringify(filters || {})}::jsonb,
        'PENDING',
        0,
        ${new Date()},
        ${new Date()}
      )
      RETURNING id, status, "targetUrl", "createdAt"
    `) as any[];

    await jobs.addJob(
      'leads',
      'lead-extraction',
      {
        huntSessionId: huntSession.id,
        userId,
        sources: [source as any],
        targetUrl,
        companyName,
        filters,
      },
      {
        timeout: 7200000,
      }
    );

    return {
      huntSessionId: huntSession.id,
      status: huntSession.status,
      source,
      targetUrl: huntSession.targetUrl,
      createdAt: huntSession.createdAt,
    };
  },

  async startLocalBusinessHunt({
    userId,
    location,
    categories,
    hasWebsite,
    radius,
    maxResults,
    googleMapsApiKey,
    jobs,
    db,
  }: StartLocalBusinessHuntParams) {
    const [user] = await db`SELECT id FROM "User" WHERE id = ${userId}`;
    if (!user) throw new Error('User not found. Please log in again.');

    const [huntSession] = await db`
    INSERT INTO "HuntSession" (
      id,
      "userId",
      "huntType",
      sources,
      filters,
      status,
      progress,
      "createdAt",
      "updatedAt"
    ) VALUES (
      gen_random_uuid(),
      ${userId},
      'LOCAL_BUSINESS',
      ARRAY['GOOGLE_MAPS', 'OPENSTREETMAP']::"LeadSource"[],
      ${JSON.stringify({ location, categories, hasWebsite, radius, maxResults })}::jsonb,
      'PENDING',
      0,
      ${new Date()},
      ${new Date()}
    )
    RETURNING id, status, "createdAt"
  `;

    for (const category of categories) {
      await jobs.addJob(
        'leads',
        'local-business-hunt',
        {
          huntSessionId: huntSession.id,
          userId,
          location,
          category,
          hasWebsite,
          radius,
          maxResults: Math.floor((maxResults || 100) / categories.length),
          googleMapsApiKey,
        },
        { timeout: 10800000 }
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

  async getHuntSessions(userId: string, db: SQL, jobs?: QueueManager) {
    const sessions = (await db`
      SELECT *
      FROM "HuntSession"
      WHERE "userId" = ${userId}
      ORDER BY "createdAt" DESC
    `) as any[];

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
                await db`
                  UPDATE "HuntSession"
                  SET status = 'FAILED',
                      error = 'Job not found in queue (worker may have crashed)',
                      "completedAt" = ${new Date()}
                  WHERE id = ${session.id}
                `;
                return {
                  ...session,
                  status: 'FAILED' as const,
                  error: 'Job not found in queue (worker may have crashed)',
                  completedAt: new Date(),
                };
              }

              const jobState = await job.getState();
              if (jobState === 'failed' || jobState === 'completed') {
                const newStatus = jobState === 'failed' ? 'FAILED' : 'COMPLETED';
                await db`
                  UPDATE "HuntSession"
                  SET status = ${newStatus},
                      error = ${jobState === 'failed' ? job.failedReason : null},
                      "completedAt" = ${new Date()}
                  WHERE id = ${session.id}
                `;
                return {
                  ...session,
                  status: newStatus as const,
                  error: jobState === 'failed' ? job.failedReason : session.error,
                  completedAt: new Date(),
                };
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

  async getHuntSessionStatus(huntSessionId: string, db: SQL) {
    const [session] = (await db`
      SELECT *
      FROM "HuntSession"
      WHERE id = ${huntSessionId}
    `) as any[];

    if (!session) {
      throw new Error('Hunt session not found');
    }

    return {
      id: session.id,
      userId: session.userId,
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

  async cancelHunt(huntSessionId: string, userId: string, db: SQL, jobs: QueueManager) {
    const [session] = (await db`
      SELECT id, "jobId", status
      FROM "HuntSession"
      WHERE id = ${huntSessionId} AND "userId" = ${userId}
    `) as any[];

    if (!session) {
      throw new Error('Hunt session not found or unauthorized');
    }

    if (session.status !== 'PENDING' && session.status !== 'PROCESSING') {
      throw new Error('Hunt session cannot be cancelled in its current state');
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

    await db`
      UPDATE "HuntSession"
      SET status = 'CANCELLED',
          "completedAt" = ${new Date()},
          "updatedAt" = ${new Date()}
      WHERE id = ${huntSessionId}
    `;

    return { success: true, huntSessionId };
  },

  async deleteHunt(huntSessionId: string, userId: string, db: SQL) {
    const [session] = (await db`
      SELECT id, status
      FROM "HuntSession"
      WHERE id = ${huntSessionId} AND "userId" = ${userId}
    `) as any[];

    if (!session) {
      throw new Error('Hunt session not found or unauthorized');
    }

    if (session.status === 'PROCESSING') {
      throw new Error('Cannot delete a hunt session that is currently processing');
    }

    await db`
      DELETE FROM "HuntSession"
      WHERE id = ${huntSessionId}
    `;

    return { success: true, huntSessionId };
  },

  async getRunDetails(huntSessionId: string, userId: string, db: SQL): Promise<RunDetails> {
    const [session] = await db`
      SELECT *
      FROM "HuntSession"
      WHERE id = ${huntSessionId}
    ` as Promise<any[]>;

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

    const leads = await db`
      SELECT id, domain, email, "firstName", "lastName", position, status, score, source, contacted, "createdAt"
      FROM "Lead"
      WHERE "huntSessionId" = ${huntSessionId}
      ORDER BY "createdAt" DESC
    ` as Promise<any[]>;

    const stats = this.calculateStats(session, leads);

    return {
      id: session.id,
      userId: session.userId,
      status: session.status,
      progress: session.progress,
      sources: session.sources,
      targetUrl: session.targetUrl,
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
        targetUrl: session.targetUrl,
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
    db: SQL,
    options?: {
      level?: 'info' | 'warning' | 'error' | 'success';
      category?: 'system' | 'source' | 'lead' | 'enrichment';
      page?: number;
      limit?: number;
    }
  ): Promise<{ events: RunEvent[]; total: number; page: number; limit: number }> {
    const [session] = await db`
      SELECT *
      FROM "HuntSession"
      WHERE id = ${huntSessionId}
    ` as Promise<any[]>;

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