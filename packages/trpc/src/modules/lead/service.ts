import { SQL, sql } from 'bun';
import type { LeadStatus } from '@repo/database';
import type { QueueManager } from '@repo/jobs';

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

export interface GetLeadsParams {
  userId: string;
  db: SQL;
  filters?: {
    status?: LeadStatus;
    search?: string;
    country?: string;
    city?: string;
    page?: number;
    limit?: number;
  };
}

export interface LeadStats {
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  contactableLeads: number;
  contactedLeads: number;
  totalEmails: number;
  totalPhoneNumbers: number;
  pendingHunts: number;
  processingHunts: number;
  completedHunts: number;
  failedHunts: number;
  successRate: number;
  averageScore: number;
}

export interface DuplicateCheckParams {
  userId: string;
  leads: Array<{
    email?: string | null;
    domain?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }>;
  db: SQL;
}

export const leadService = {
  checkForDuplicates: async ({ userId, leads, db }: DuplicateCheckParams) => {
    const emailsToCheck = leads.filter((l) => l.email).map((l) => l.email!);
    const domainsToCheck = leads.filter((l) => l.domain).map((l) => l.domain!);

    const existingLeads = await (async () => {
      const conditions = [sql`"userId" = ${userId}`];

      const emailConditions =
        emailsToCheck.length > 0
          ? sql`email IN (${sql.join(emailsToCheck.map((e) => sql`${e}`))})`
          : null;

      const nameDomainConditions = leads
        .filter((l) => l.domain && l.firstName && l.lastName)
        .map(
          (l) =>
            sql`(domain = ${l.domain!} AND "firstName" = ${l.firstName!} AND "lastName" = ${l.lastName!})`
        );
      const nameDomainCombinedConditions =
        nameDomainConditions.length > 0 ? sql.join(nameDomainConditions, sql` OR `) : null;

      const orConditions = [];
      if (emailConditions) {
        orConditions.push(emailConditions);
      }
      if (nameDomainCombinedConditions) {
        orConditions.push(nameDomainCombinedConditions);
      }

      if (orConditions.length > 0) {
        conditions.push(sql`(${sql.join(orConditions, sql` OR `)})`);
      }

      const whereClause =
        conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

      return db`
        SELECT email, domain, "firstName", "lastName"
        FROM "Lead"
        ${whereClause}
      ` as Promise<any[]>;
    })();

    const duplicateKeys = new Set<string>();
    existingLeads.forEach((existing) => {
      if (existing.email) {
        duplicateKeys.add(`email:${existing.email}`);
      }
      if (existing.domain && existing.firstName && existing.lastName) {
        duplicateKeys.add(`person:${existing.domain}:${existing.firstName}:${existing.lastName}`);
      }
    });

    const newLeads = leads.filter((lead) => {
      if (lead.email && duplicateKeys.has(`email:${lead.email}`)) {
        return false;
      }
      if (lead.domain && lead.firstName && lead.lastName) {
        const personKey = `person:${lead.domain}:${lead.firstName}:${lead.lastName}`;
        if (duplicateKeys.has(personKey)) {
          return false;
        }
      }
      return true;
    });

    return {
      newLeads,
      duplicatesFiltered: leads.length - newLeads.length,
    };
  },

  startHunt: async ({
    userId,
    source,
    targetUrl,
    companyName,
    speed,
    filters,
    jobs,
    db,
  }: StartHuntParams) => {
    const [user] = (await db`
      SELECT id FROM "User" WHERE id = ${userId}
    `) as Promise<any[]>;

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
    `) as Promise<any[]>;

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

  startLocalBusinessHunt: async ({
    userId,
    location,
    categories,
    hasWebsite,
    radius,
    maxResults,
    googleMapsApiKey,
    jobs,
    db,
  }: StartLocalBusinessHuntParams) => {
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

  getHuntSessions: async (userId: string, db: SQL, jobs?: QueueManager) => {
    const sessions = (await db`
      SELECT *
      FROM "HuntSession"
      WHERE "userId" = ${userId}
      ORDER BY "createdAt" DESC
    `) as Promise<any[]>;

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

  getHuntSessionStatus: async (huntSessionId: string, db: SQL) => {
    const [session] = (await db`
      SELECT *
      FROM "HuntSession"
      WHERE id = ${huntSessionId}
    `) as Promise<any[]>;

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
};

export default leadService;
