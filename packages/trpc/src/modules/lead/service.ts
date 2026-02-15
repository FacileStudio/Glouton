import type { PrismaClient, LeadStatus } from '@repo/database';
import { Prisma } from '@repo/database';
import type { QueueManager } from '@repo/jobs';

export interface StartHuntParams {
  userId: string;
  source: string;
  targetUrl?: string;
  companyName?: string;
  speed: number;
  filters?: any;
  jobs: QueueManager;
  db: PrismaClient;
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
  db: PrismaClient;
}

export interface GetLeadsParams {
  userId: string;
  db: PrismaClient;
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
  db: PrismaClient;
}

export const leadService = {
  checkForDuplicates: async ({ userId, leads, db }: DuplicateCheckParams) => {
    const emailsToCheck = leads.filter(l => l.email).map(l => l.email!);
    const domainsToCheck = leads.filter(l => l.domain).map(l => l.domain!);

    const existingLeads = await db.lead.findMany({
      where: {
        userId,
        OR: [
          { email: { in: emailsToCheck } },
          {
            AND: leads.filter(l => l.domain && l.firstName && l.lastName).map(l => ({
              domain: l.domain!,
              firstName: l.firstName!,
              lastName: l.lastName!,
            }))
          }
        ],
      },
      select: {
        email: true,
        domain: true,
        firstName: true,
        lastName: true,
      },
    });

    const duplicateKeys = new Set<string>();
    existingLeads.forEach(existing => {
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

    const newLeads = leads.filter(lead => {
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

  startHunt: async ({ userId, source, targetUrl, companyName, speed, filters, jobs, db }: StartHuntParams) => {
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    /**
     * if
     */
    if (!user) {
      throw new Error('User not found. Please log in again.');
    }

    const huntSession = await db.huntSession.create({
      data: {
        userId,
        huntType: 'DOMAIN',
        sources: [source as any],
        targetUrl,
        filters: filters || {},
        status: 'PENDING',
        progress: 0,
      },
    });

    await jobs.addJob('leads', 'lead-extraction', {
      huntSessionId: huntSession.id,
      userId,
      sources: [source as any],
      targetUrl,
      companyName,
      filters,
    }, {
      timeout: 7200000,
    });

    return {
      huntSessionId: huntSession.id,
      status: huntSession.status,
      source,
      targetUrl: huntSession.targetUrl,
      createdAt: huntSession.createdAt,
    };
  },

  startLocalBusinessHunt: async ({ userId, location, categories, hasWebsite, radius, maxResults, googleMapsApiKey, jobs, db }: StartLocalBusinessHuntParams) => {
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    /**
     * if
     */
    if (!user) {
      throw new Error('User not found. Please log in again.');
    }

    const huntSession = await db.huntSession.create({
      data: {
        userId,
        huntType: 'LOCAL_BUSINESS',
        sources: ['GOOGLE_MAPS', 'OPENSTREETMAP'] as any,
        filters: {
          location,
          categories,
          hasWebsite,
          radius,
          maxResults,
        },
        status: 'PENDING',
        progress: 0,
      },
    });

    /**
     * for
     */
    for (const category of categories) {
      await jobs.addJob('leads', 'local-business-hunt', {
        huntSessionId: huntSession.id,
        userId,
        location,
        category,
        hasWebsite,
        radius,
        maxResults: Math.floor((maxResults || 100) / categories.length),
        googleMapsApiKey,
      }, {
        timeout: 10800000,
      });
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
    const where: Prisma.LeadWhereInput = { userId };

    /**
     * if
     */
    if (filters?.status) {
      where.status = filters.status;
    }

    /**
     * if
     */
    if (filters?.country) {
      where.country = { contains: filters.country, mode: 'insensitive' };
    }

    /**
     * if
     */
    if (filters?.city) {
      where.city = { contains: filters.city, mode: 'insensitive' };
    }

    /**
     * if
     */
    if (filters?.search) {
      where.OR = [
        { domain: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const queryOptions: any = {
      where,
      orderBy: { createdAt: 'desc' },
    };

    /**
     * if
     */
    if (filters?.limit !== undefined) {
      const page = filters.page ?? 1;
      const limit = filters.limit;
      /**
       * skip
       */
      const skip = (page - 1) * limit;
      queryOptions.skip = skip;
      queryOptions.take = limit;
    }

    const [leads, total] = await Promise.all([
      db.lead.findMany(queryOptions),
      db.lead.count({ where }),
    ]);

    return {
      leads: (leads || []).map((lead) => ({
        id: lead.id,
        domain: lead.domain,
        email: lead.email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        city: lead.city,
        country: lead.country,
        status: lead.status,
        score: lead.score,
        technologies: lead.technologies,
        additionalEmails: lead.additionalEmails,
        phoneNumbers: lead.phoneNumbers,
        physicalAddresses: lead.physicalAddresses,
        socialProfiles: lead.socialProfiles,
        companyInfo: lead.companyInfo,
        websiteAudit: lead.websiteAudit,
        scrapedAt: lead.scrapedAt,
        auditedAt: lead.auditedAt,
        huntSessionId: lead.huntSessionId,
        contacted: lead.contacted,
        lastContactedAt: lead.lastContactedAt,
        emailsSentCount: lead.emailsSentCount,
        createdAt: lead.createdAt,
      })),
      pagination: filters?.limit !== undefined ? {
        page: filters.page ?? 1,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      } : {
        page: 1,
        limit: total,
        total,
        totalPages: 1,
      },
    };
  },

  getHuntSessions: async (userId: string, db: PrismaClient, jobs?: QueueManager) => {
    const sessions = await db.huntSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const validatedSessions = await Promise.all(
      sessions.map(async (session) => {
        /**
         * if
         */
        if (jobs && session.jobId && (session.status === 'PENDING' || session.status === 'PROCESSING')) {
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
                await db.huntSession.update({
                  where: { id: session.id },
                  data: {
                    status: 'FAILED',
                    error: 'Job not found in queue (worker may have crashed)',
                    completedAt: new Date(),
                  },
                });
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
                await db.huntSession.update({
                  where: { id: session.id },
                  data: {
                    status: newStatus,
                    error: jobState === 'failed' ? job.failedReason : undefined,
                    completedAt: new Date(),
                  },
                });
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

  getHuntSessionStatus: async (huntSessionId: string, db: PrismaClient) => {
    const session = await db.huntSession.findUnique({
      where: { id: huntSessionId },
    });

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

  deleteLead: async (leadId: string, userId: string, db: PrismaClient) => {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
    });

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
      contactableLeads,
      contactedLeads,
      totalEmails,
      totalPhoneNumbers,
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
      db.lead.count({ where: { userId, contacted: false, email: { not: null } } }),
      db.lead.count({ where: { userId, contacted: true } }),
      db.lead.count({ where: { userId, email: { not: null } } }),
      db.lead.count({ where: { userId, phoneNumbers: { isEmpty: false } } }),
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
      contactableLeads,
      contactedLeads,
      totalEmails,
      totalPhoneNumbers,
      pendingHunts,
      processingHunts,
      completedHunts,
      failedHunts,
      successRate: Math.round(successRate * 10) / 10,
      averageScore: Math.round((scoreAggregation._avg.score ?? 0) * 10) / 10,
    };
  },

  startAudit: async ({ userId, jobs, db }: { userId: string; jobs: QueueManager; db: PrismaClient }) => {
    const existingSessions = await db.auditSession.findMany({
      where: {
        userId,
        status: {
          in: ['PENDING', 'PROCESSING'],
        },
      },
    });

    /**
     * for
     */
    for (const existingSession of existingSessions) {
      try {
        await db.auditSession.update({
          where: { id: existingSession.id },
          data: {
            status: 'CANCELLED',
            completedAt: new Date(),
          },
        });

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

    const auditSession = await db.auditSession.create({
      data: {
        userId,
        status: 'PENDING',
        progress: 0,
      },
    });

    try {
      const job = await jobs.addJob('leads', 'lead-audit', {
        auditSessionId: auditSession.id,
        userId,
      }, {
        timeout: 21600000,
      });

      await db.auditSession.update({
        where: { id: auditSession.id },
        data: {
          jobId: job.id,
        },
      });

      return {
        auditSessionId: auditSession.id,
        status: auditSession.status,
        createdAt: auditSession.createdAt,
      };
    } catch (error) {
      await db.auditSession.update({
        where: { id: auditSession.id },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Failed to start audit job',
          completedAt: new Date(),
        },
      });

      throw error;
    }
  },

  getAuditSessions: async (userId: string, db: PrismaClient, jobs?: QueueManager) => {
    const sessions = await db.auditSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const validatedSessions = await Promise.all(
      sessions.map(async (session) => {
        /**
         * if
         */
        if (jobs && session.jobId && (session.status === 'PENDING' || session.status === 'PROCESSING')) {
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
                await db.auditSession.update({
                  where: { id: session.id },
                  data: {
                    status: 'FAILED',
                    error: 'Job not found in queue (worker may have crashed)',
                    completedAt: new Date(),
                  },
                });
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
                await db.auditSession.update({
                  where: { id: session.id },
                  data: {
                    status: newStatus,
                    error: jobState === 'failed' ? job.failedReason : undefined,
                    completedAt: new Date(),
                  },
                });
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

  getAuditSessionStatus: async (auditSessionId: string, db: PrismaClient) => {
    const session = await db.auditSession.findUnique({
      where: { id: auditSessionId },
    });

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

  cancelAudit: async (auditSessionId: string, userId: string, db: PrismaClient, jobs?: QueueManager) => {
    const session = await db.auditSession.findUnique({
      where: { id: auditSessionId },
    });

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
    if (session.status === 'COMPLETED' || session.status === 'FAILED' || session.status === 'CANCELLED') {
      throw new Error(`Cannot cancel an audit that is already ${session.status.toLowerCase()}`);
    }

    const updatedSession = await db.auditSession.update({
      where: { id: auditSessionId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });

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

  deleteAudit: async (auditSessionId: string, userId: string, db: PrismaClient) => {
    const session = await db.auditSession.findUnique({
      where: { id: auditSessionId },
    });

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

    await db.auditSession.delete({
      where: { id: auditSessionId },
    });

    return { success: true };
  },
};

export default leadService;
