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
      /**
       * if
       */
      if (existing.email) {
        duplicateKeys.add(`email:${existing.email}`);
      }
      /**
       * if
       */
      if (existing.domain && existing.firstName && existing.lastName) {
        duplicateKeys.add(`person:${existing.domain}:${existing.firstName}:${existing.lastName}`);
      }
    });

    const newLeads = leads.filter((lead) => {
      /**
       * if
       */
      if (lead.email && duplicateKeys.has(`email:${lead.email}`)) {
        return false;
      }
      /**
       * if
       */
      if (lead.domain && lead.firstName && lead.lastName) {
        const personKey = `person:${lead.domain}:${lead.firstName}:${lead.lastName}`;
        /**
         * if
         */
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

    /**
     * if
     */
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
    const [user] = (await db`
      SELECT id FROM "User" WHERE id = ${userId}
    `) as Promise<any[]>;

    /**
     * if
     */
    if (!user) {
      throw new Error('User not found. Please log in again.');
    }

    const [huntSession] = (await db`
      INSERT INTO "HuntSession" (
        "userId", "huntType", sources, filters, status, progress, "createdAt", "updatedAt"
      ) VALUES (
        ${userId},
        'LOCAL_BUSINESS',
        ${JSON.stringify(['GOOGLE_MAPS', 'OPENSTREETMAP'])}::jsonb,
        ${JSON.stringify({ location, categories, hasWebsite, radius, maxResults })}::jsonb,
        'PENDING',
        0,
        ${new Date()},
        ${new Date()}
      )
      RETURNING id, status, "createdAt"
    `) as Promise<any[]>;

    /**
     * for
     */
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
        {
          timeout: 10800000,
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

  getLeads: async ({ userId, db, filters }: GetLeadsParams) => {
    // 1. Initialisation des conditions avec l'ID utilisateur
    const conditions = [db`"userId" = ${userId}`];

    // 2. Filtres simples
    if (filters?.status) {
      conditions.push(db`status = ${filters.status}`);
    }

    // 3. Filtres géographiques (Simplification du LIKE)
    if (filters?.country) {
      conditions.push(db`country ILIKE ${`%${filters.country}%`}`);
    }

    if (filters?.city) {
      conditions.push(db`city ILIKE ${`%${filters.city}%`}`);
    }

    // 4. Recherche textuelle (Gestion du OR sans sql.join)
    if (filters?.search) {
      const s = `%${filters.search}%`;
      conditions.push(db`(
      domain ILIKE ${s} OR 
      email ILIKE ${s} OR 
      "firstName" ILIKE ${s} OR 
      "lastName" ILIKE ${s}
    )`);
    }

    // 5. Composition de la clause WHERE (Le remplacement de sql.join)
    // On réduit le tableau de fragments en injectant " AND " entre chaque
    const whereClause = conditions.reduce((acc, curr) => db`${acc} AND ${curr}`);

    // 6. Pagination
    let limit = filters?.limit ?? 50;
    let offset = ((filters?.page ?? 1) - 1) * limit;

    // 7. Exécution des requêtes en parallèle
    const [leads, totalResult] = await Promise.all([
      db`
      SELECT
        id, domain, email, "firstName", "lastName", city, country, status, score, technologies,
        "additionalEmails", "phoneNumbers", "physicalAddresses", "socialProfiles", "companyInfo",
        "websiteAudit", "scrapedAt", "auditedAt", "huntSessionId", contacted, "lastContactedAt",
        "emailsSentCount", "createdAt"
      FROM "Lead"
      WHERE ${whereClause}
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    ` as Promise<any[]>,
      db`
      SELECT COUNT(*) as count 
      FROM "Lead" 
      WHERE ${whereClause}
    ` as Promise<[{ count: string | number }]>,
    ]);

    const total = Number(totalResult[0].count);

    return {
      leads: leads || [],
      pagination: {
        page: filters?.page ?? 1,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
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
        /**
         * if
         */
        if (
          jobs &&
          session.jobId &&
          (session.status === 'PENDING' || session.status === 'PROCESSING')
        ) {
          try {
            const queue = jobs['queues'].get('leads');
            /**
             * if
             */
            if (queue) {
              const job = await queue.getJob(session.jobId);
              /**
               * if
               */
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
              /**
               * if
               */
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

    /**
     * if
     */
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

  deleteLead: async (leadId: string, userId: string, db: SQL) => {
    const [lead] = (await db`
      SELECT id, "userId"
      FROM "Lead"
      WHERE id = ${leadId}
    `) as Promise<any[]>;

    /**
     * if
     */
    if (!lead) {
      throw new Error('Lead not found');
    }

    /**
     * if
     */
    if (lead.userId !== userId) {
      throw new Error('Unauthorized to delete this lead');
    }

    await db`
      DELETE FROM "Lead"
      WHERE id = ${leadId}
    `;

    return {
      id: lead.id,
      deleted: true,
    };
  },

  getStats: async (userId: string, db: SQL): Promise<LeadStats> => {
    try {
      const [leadStats, huntStats] = await Promise.all([
        db`
        SELECT 
          COUNT(*)::INT as total,
          COUNT(*) FILTER (WHERE status = 'HOT')::INT as hot,
          COUNT(*) FILTER (WHERE status = 'WARM')::INT as warm,
          COUNT(*) FILTER (WHERE status = 'COLD')::INT as cold,
          COUNT(*) FILTER (WHERE contacted = FALSE AND email IS NOT NULL)::INT as contactable,
          COUNT(*) FILTER (WHERE contacted = TRUE)::INT as contacted,
          COUNT(*) FILTER (WHERE email IS NOT NULL)::INT as emails,
          -- Correction ici : on utilise cardinality() pour les colonnes text[]
          COUNT(*) FILTER (WHERE "phoneNumbers" IS NOT NULL AND cardinality("phoneNumbers") > 0)::INT as phones,
          COALESCE(AVG(score), 0)::FLOAT as avg_score
        FROM "Lead" 
        WHERE "userId" = ${userId}
      ` as Promise<any[]>,

        db`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'PENDING')::INT as pending,
          COUNT(*) FILTER (WHERE status = 'PROCESSING')::INT as processing,
          COUNT(*) FILTER (WHERE status = 'COMPLETED')::INT as completed,
          COUNT(*) FILTER (WHERE status = 'FAILED')::INT as failed
        FROM "HuntSession" 
        WHERE "userId" = ${userId}
      ` as Promise<any[]>,
      ]);

      const ls = leadStats[0] || {};
      const hs = huntStats[0] || {};

      const completed = hs.completed || 0;
      const failed = hs.failed || 0;
      const totalHunts = completed + failed;
      const successRate = totalHunts > 0 ? (completed / totalHunts) * 100 : 0;

      return {
        totalLeads: ls.total || 0,
        hotLeads: ls.hot || 0,
        warmLeads: ls.warm || 0,
        coldLeads: ls.cold || 0,
        contactableLeads: ls.contactable || 0,
        contactedLeads: ls.contacted || 0,
        totalEmails: ls.emails || 0,
        totalPhoneNumbers: ls.phones || 0,
        pendingHunts: hs.pending || 0,
        processingHunts: hs.processing || 0,
        completedHunts: completed,
        failedHunts: failed,
        successRate: Math.round(successRate * 10) / 10,
        averageScore: Math.round((ls.avg_score || 0) * 10) / 10,
      };
    } catch (error) {
      console.error('[DATABASE_ERROR] getStats failed:', error);
      throw error;
    }
  },
  startAudit: async ({ userId, jobs, db }: { userId: string; jobs: QueueManager; db: SQL }) => {
    const existingSessions = (await db`
      SELECT id, "jobId"
      FROM "AuditSession"
      WHERE "userId" = ${userId}
        AND status IN ('PENDING', 'PROCESSING')
    `) as Promise<any[]>;

    /**
     * for
     */
    for (const existingSession of existingSessions) {
      try {
        await db`
          UPDATE "AuditSession"
          SET status = 'CANCELLED',
              "completedAt" = ${new Date()}
          WHERE id = ${existingSession.id}
        `;

        /**
         * if
         */
        if (existingSession.jobId) {
          const queue = jobs['queues'].get('leads');
          /**
           * if
           */
          if (queue) {
            const job = await queue.getJob(existingSession.jobId);
            /**
             * if
             */
            if (job) {
              const state = await job.getState();
              /**
               * if
               */
              if (state === 'waiting' || state === 'delayed') {
                await job.remove();
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to cancel existing audit session ${existingSession.id}:`, error);
      }
    }

    const [auditSession] = (await db`
      INSERT INTO "AuditSession" (
        "userId", status, progress, "createdAt", "updatedAt"
      ) VALUES (
        ${userId},
        'PENDING',
        0,
        ${new Date()},
        ${new Date()}
      )
      RETURNING id, status, "createdAt"
    `) as Promise<any[]>;

    try {
      const job = await jobs.addJob(
        'leads',
        'lead-audit',
        {
          auditSessionId: auditSession.id,
          userId,
        },
        {
          timeout: 21600000,
        }
      );

      await db`
        UPDATE "AuditSession"
        SET "jobId" = ${job.id}
        WHERE id = ${auditSession.id}
      `;

      return {
        auditSessionId: auditSession.id,
        status: auditSession.status,
        createdAt: auditSession.createdAt,
      };
    } catch (error) {
      await db`
        UPDATE "AuditSession"
        SET status = 'FAILED',
            error = ${error instanceof Error ? error.message : 'Failed to start audit job'},
            "completedAt" = ${new Date()}
        WHERE id = ${auditSession.id}
      `;

      throw error;
    }
  },

  getAuditSessions: async (userId: string, db: SQL, jobs?: QueueManager) => {
    const sessions = (await db`
      SELECT *
      FROM "AuditSession"
      WHERE "userId" = ${userId}
      ORDER BY "createdAt" DESC
    `) as Promise<any[]>;

    const validatedSessions = await Promise.all(
      sessions.map(async (session) => {
        /**
         * if
         */
        if (
          jobs &&
          session.jobId &&
          (session.status === 'PENDING' || session.status === 'PROCESSING')
        ) {
          try {
            const queue = jobs['queues'].get('leads');
            /**
             * if
             */
            if (queue) {
              const job = await queue.getJob(session.jobId);
              /**
               * if
               */
              if (!job) {
                await db`
                  UPDATE "AuditSession"
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
              /**
               * if
               */
              if (jobState === 'failed' || jobState === 'completed') {
                const newStatus = jobState === 'failed' ? 'FAILED' : 'COMPLETED';
                await db`
                  UPDATE "AuditSession"
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
            console.warn(`Failed to validate audit session ${session.id}:`, error);
          }
        }

        return session;
      })
    );

    return validatedSessions.map((session) => ({
      id: session.id,
      status: session.status,
      progress: session.progress,
      totalLeads: session.totalLeads,
      processedLeads: session.processedLeads,
      updatedLeads: session.updatedLeads,
      failedLeads: session.failedLeads,
      error: session.error,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      createdAt: session.createdAt,
    }));
  },

  getAuditSessionStatus: async (auditSessionId: string, db: SQL) => {
    const [session] = (await db`
      SELECT *
      FROM "AuditSession"
      WHERE id = ${auditSessionId}
    `) as Promise<any[]>;

    /**
     * if
     */
    if (!session) {
      throw new Error('Audit session not found');
    }

    return {
      id: session.id,
      userId: session.userId,
      status: session.status,
      progress: session.progress,
      totalLeads: session.totalLeads,
      processedLeads: session.processedLeads,
      updatedLeads: session.updatedLeads,
      failedLeads: session.failedLeads,
      error: session.error,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      createdAt: session.createdAt,
    };
  },

  cancelAudit: async (auditSessionId: string, userId: string, db: SQL, jobs?: QueueManager) => {
    const [session] = (await db`
      SELECT *
      FROM "AuditSession"
      WHERE id = ${auditSessionId}
    `) as Promise<any[]>;

    /**
     * if
     */
    if (!session) {
      throw new Error('Audit session not found');
    }

    /**
     * if
     */
    if (session.userId !== userId) {
      throw new Error('Unauthorized to cancel this audit session');
    }

    /**
     * if
     */
    if (
      session.status === 'COMPLETED' ||
      session.status === 'FAILED' ||
      session.status === 'CANCELLED'
    ) {
      throw new Error(`Cannot cancel an audit that is already ${session.status.toLowerCase()}`);
    }

    const [updatedSession] = (await db`
      UPDATE "AuditSession"
      SET status = 'CANCELLED',
          "completedAt" = ${new Date()}
      WHERE id = ${auditSessionId}
      RETURNING *
    `) as Promise<any[]>;

    /**
     * if
     */
    if (jobs && session.jobId) {
      try {
        const queue = jobs['queues'].get('leads');
        /**
         * if
         */
        if (queue) {
          const job = await queue.getJob(session.jobId);
          /**
           * if
           */
          if (job) {
            const state = await job.getState();
            /**
             * if
             */
            if (state === 'waiting' || state === 'delayed') {
              await job.remove();
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to remove job ${session.jobId} from queue:`, error);
      }
    }

    /**
     * if
     */
    if (globalThis.broadcastToUser) {
      globalThis.broadcastToUser(userId, {
        type: 'audit-cancelled',
        data: {
          auditSessionId,
          status: 'CANCELLED',
        },
      });
    }

    return updatedSession;
  },

  deleteAudit: async (auditSessionId: string, userId: string, db: SQL) => {
    const [session] = (await db`
      SELECT *
      FROM "AuditSession"
      WHERE id = ${auditSessionId}
    `) as Promise<any[]>;

    /**
     * if
     */
    if (!session) {
      throw new Error('Audit session not found');
    }

    /**
     * if
     */
    if (session.userId !== userId) {
      throw new Error('Unauthorized to delete this audit session');
    }

    await db`
      DELETE FROM "AuditSession"
      WHERE id = ${auditSessionId}
    `;

    return { success: true };
  },
};

export default leadService;
