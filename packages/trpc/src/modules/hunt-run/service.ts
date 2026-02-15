import { SQL, sql } from 'bun';
import type { HuntSession, Lead } from '@repo/database';
import { TRPCError } from '@trpc/server';

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

/**
 * getRunDetails
 */
async function getRunDetails(
  huntSessionId: string,
  userId: string,
  db: SQL
): Promise<RunDetails> {
  const [session] = await db`
    SELECT *
    FROM "HuntSession"
    WHERE id = ${huntSessionId}
  ` as Promise<any[]>;

  /**
   * if
   */
  if (!session) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Hunt session not found',
    });
  }

  /**
   * if
   */
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

  const stats = calculateStats(session, leads);

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
}

/**
 * calculateStats
 */
function calculateStats(
  session: HuntSession,
  leads: Array<{ status: string; score: number; contacted: boolean }>
): RunDetails['stats'] {
  const hotLeads = leads.filter((l) => l.status === 'HOT').length;
  const warmLeads = leads.filter((l) => l.status === 'WARM').length;
  const coldLeads = leads.filter((l) => l.status === 'COLD').length;
  const contactedLeads = leads.filter((l) => l.contacted).length;

  let duration: number | null = null;
  /**
   * if
   */
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
}

/**
 * generateRunEvents
 */
function generateRunEvents(session: HuntSession): RunEvent[] {
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

  /**
   * if
   */
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

  /**
   * if
   */
  if (session.sourceStats && typeof session.sourceStats === 'object') {
    const sourceStats = session.sourceStats as Record<
      string,
      { leads: number; errors: number; rateLimited: boolean }
    >;

    /**
     * for
     */
    for (const [source, stats] of Object.entries(sourceStats)) {
      /**
       * if
       */
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

      /**
       * if
       */
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

      /**
       * if
       */
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

  /**
   * if
   */
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

  /**
   * if
   */
  if (session.completedAt) {
    /**
     * if
     */
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
}

/**
 * getRunEvents
 */
async function getRunEvents(
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

  /**
   * if
   */
  if (!session) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Hunt session not found',
    });
  }

  /**
   * if
   */
  if (session.userId !== userId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have access to this hunt session',
    });
  }

  let events = generateRunEvents(session);

  /**
   * if
   */
  if (options?.level) {
    events = events.filter((e) => e.level === options.level);
  }

  /**
   * if
   */
  if (options?.category) {
    events = events.filter((e) => e.category === options.category);
  }

  const total = events.length;
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  /**
   * offset
   */
  const offset = (page - 1) * limit;

  const paginatedEvents = events.slice(offset, offset + limit);

  return {
    events: paginatedEvents,
    total,
    page,
    limit,
  };
}

const huntRunService = {
  getRunDetails,
  getRunEvents,
};

export default huntRunService;
