import { PrismaClient, Prisma, type LeadStatus } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import {
  paginationParams,
  calculatePagination,
} from '@repo/database/utils/prisma-helpers';

export interface GetLeadsParams {
  userId: string;
  prisma: PrismaClient;
  filters?: {
    status?: LeadStatus;
    search?: string;
    country?: string;
    city?: string;
    category?: string;
    businessType?: string;
    contacted?: boolean;
    hasWebsite?: boolean;
    hasSocial?: boolean;
    hasPhone?: boolean;
    hasGps?: boolean;
    hasEmail?: boolean;
    sortBy?: string;
    sortOrder?: string;
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
  totalDomains: number;
  totalSocials: number;
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
  prisma: PrismaClient;
}

export interface Context {
  user: { id: string };
  prisma: PrismaClient;
  log: {
    info: (data: any) => void;
    error: (data: any) => void;
  };
}

function hasSocialProfilesFilter(hasSocial: boolean | undefined): any {
  if (hasSocial === undefined) return undefined;

  if (hasSocial) {
    return {
      NOT: [
        { socialProfiles: Prisma.DbNull },
        { socialProfiles: Prisma.JsonNull },
        { socialProfiles: { equals: [] } },
      ],
    };
  } else {
    return {
      OR: [
        { socialProfiles: Prisma.DbNull },
        { socialProfiles: Prisma.JsonNull },
        { socialProfiles: { equals: [] } },
      ],
    };
  }
}

function hasPhoneNumbersFilter(hasPhone: boolean | undefined): any {
  if (hasPhone === undefined) return undefined;

  if (hasPhone) {
    return {
      NOT: [
        { phoneNumbers: { isEmpty: true } },
      ],
    };
  } else {
    return {
      phoneNumbers: { isEmpty: true },
    };
  }
}

function buildLeadWhereClause(userId: string, filters?: GetLeadsParams['filters']) {
  const where: Prisma.LeadWhereInput = {
    userId,
  };

  if (!filters) return where;

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.country) {
    where.country = {
      contains: filters.country,
      mode: 'insensitive',
    };
  }

  if (filters.city) {
    where.city = {
      contains: filters.city,
      mode: 'insensitive',
    };
  }

  if (filters.category) {
    where.category = filters.category;
  }

  if (filters.businessType) {
    where.businessType = filters.businessType as any;
  }

  if (filters.contacted !== undefined) {
    where.contacted = filters.contacted;
  }

  if (filters.hasWebsite !== undefined) {
    if (filters.hasWebsite) {
      where.hasWebsite = true;
    } else {
      where.OR = [
        { hasWebsite: null },
        { hasWebsite: false },
      ];
    }
  }

  const socialFilter = hasSocialProfilesFilter(filters.hasSocial);
  if (socialFilter) {
    where.AND = where.AND ? [...(Array.isArray(where.AND) ? where.AND : [where.AND]), socialFilter] : socialFilter;
  }

  const phoneFilter = hasPhoneNumbersFilter(filters.hasPhone);
  if (phoneFilter) {
    where.AND = where.AND ? [...(Array.isArray(where.AND) ? where.AND : [where.AND]), phoneFilter] : phoneFilter;
  }

  if (filters.hasGps !== undefined) {
    if (filters.hasGps) {
      where.coordinates = { not: Prisma.DbNull } as any;
    } else {
      where.coordinates = Prisma.DbNull as any;
    }
  }

  if (filters.hasEmail !== undefined) {
    if (filters.hasEmail) {
      where.email = { not: null };
    } else {
      where.email = null;
    }
  }

  if (filters.search) {
    where.OR = [
      { domain: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
      { firstName: { contains: filters.search, mode: 'insensitive' } },
      { lastName: { contains: filters.search, mode: 'insensitive' } },
      { businessName: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

function buildOrderBy(sortBy?: string, sortOrder?: string) {
  const direction = sortOrder === 'asc' ? 'asc' : 'desc';

  switch (sortBy) {
    case 'domain':
      return [{ domain: { sort: direction, nulls: 'last' } }];
    case 'email':
      return [{ email: { sort: direction, nulls: 'last' } }];
    case 'city':
      return [{ city: { sort: direction, nulls: 'last' } }];
    case 'country':
      return [{ country: { sort: direction, nulls: 'last' } }];
    case 'score':
      return [{ score: { sort: direction, nulls: 'last' } }];
    case 'status':
      return [{ status: { sort: direction, nulls: 'last' } }];
    default:
      return [{ createdAt: direction }];
  }
}

export default {
  async getLeads({ userId, prisma, filters }: GetLeadsParams) {
    const where = buildLeadWhereClause(userId, filters);
    const pagination = paginationParams(filters?.page, filters?.limit);
    const orderBy = buildOrderBy(filters?.sortBy, filters?.sortOrder) as any;

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy,
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          domain: true,
          email: true,
          firstName: true,
          lastName: true,
          businessName: true,
          city: true,
          country: true,
          status: true,
          score: true,
          technologies: true,
          additionalEmails: true,
          phoneNumbers: true,
          physicalAddresses: true,
          socialProfiles: true,
          companyInfo: true,
          websiteAudit: true,
          scrapedAt: true,
          auditedAt: true,
          huntSessionId: true,
          contacted: true,
          lastContactedAt: true,
          emailsSentCount: true,
          createdAt: true,
          coordinates: true,
          hasWebsite: true,
          businessType: true,
          category: true,
        },
      }),
      prisma.lead.count({ where }),
    ]);

    const paginationMeta = calculatePagination(
      total,
      filters?.page ?? 1,
      filters?.limit ?? 50
    );

    return {
      leads,
      pagination: {
        page: paginationMeta.page,
        limit: paginationMeta.limit,
        total: paginationMeta.total,
        totalPages: paginationMeta.totalPages,
      },
    };
  },

  async getStats(userId: string, prisma: PrismaClient): Promise<LeadStats> {
    try {
      const [
        totalLeads,
        hotLeads,
        warmLeads,
        coldLeads,
        contactableLeads,
        contactedLeads,
        totalEmails,
        totalPhoneNumbers,
        totalDomains,
        totalSocials,
        pendingHunts,
        processingHunts,
        completedHunts,
        failedHunts,
        averageScoreResult,
      ] = await Promise.all([
        prisma.lead.count({ where: { userId } }),
        prisma.lead.count({ where: { userId, status: 'HOT' } }),
        prisma.lead.count({ where: { userId, status: 'WARM' } }),
        prisma.lead.count({ where: { userId, status: 'COLD' } }),
        prisma.lead.count({
          where: {
            userId,
            contacted: false,
            email: { not: null },
          },
        }),
        prisma.lead.count({
          where: {
            userId,
            contacted: true,
          },
        }),
        prisma.lead.count({
          where: {
            userId,
            email: { not: null },
          },
        }),
        prisma.lead.count({
          where: {
            userId,
            phoneNumbers: { isEmpty: false },
          },
        }),
        prisma.lead.count({
          where: {
            userId,
            domain: { not: null },
          },
        }),
        prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*)::INT as count
          FROM "Lead"
          WHERE "userId" = ${userId}
            AND "socialProfiles" IS NOT NULL
            AND jsonb_typeof("socialProfiles") = 'array'
            AND jsonb_array_length("socialProfiles") > 0
        `,
        prisma.huntSession.count({
          where: { userId, status: 'PENDING' },
        }),
        prisma.huntSession.count({
          where: { userId, status: 'PROCESSING' },
        }),
        prisma.huntSession.count({
          where: { userId, status: 'COMPLETED' },
        }),
        prisma.huntSession.count({
          where: { userId, status: 'FAILED' },
        }),
        prisma.lead.aggregate({
          where: { userId },
          _avg: { score: true },
        }),
      ]);

      const socialsCount = Number(totalSocials[0]?.count ?? 0);
      const avgScore = averageScoreResult._avg.score ?? 0;

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
        totalDomains,
        totalSocials: socialsCount,
        pendingHunts,
        processingHunts,
        completedHunts,
        failedHunts,
        successRate: Math.round(successRate * 10) / 10,
        averageScore: Math.round(avgScore * 10) / 10,
      };
    } catch (error) {
      console.error('[DATABASE_ERROR] getStats failed:', error);
      throw error;
    }
  },

  async getActiveSessions(ctx: Context) {
    try {
      const [activeAudits, activeHunts] = await Promise.all([
        ctx.prisma.auditSession.findMany({
          where: {
            userId: ctx.user.id,
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          select: {
            id: true,
            status: true,
            progress: true,
            totalLeads: true,
            processedLeads: true,
            updatedLeads: true,
            failedLeads: true,
            currentDomain: true,
            startedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        ctx.prisma.huntSession.findMany({
          where: {
            userId: ctx.user.id,
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          select: {
            id: true,
            status: true,
            progress: true,
            totalLeads: true,
            successfulLeads: true,
            failedLeads: true,
            startedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      return {
        audits: activeAudits,
        hunts: activeHunts,
      };
    } catch (error) {
      ctx.log.error({
        action: 'get-active-sessions-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve active sessions',
      });
    }
  },

  async deleteLead(leadId: string, userId: string, prisma: PrismaClient) {
    try {
      const existingLead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { id: true, userId: true },
      });

      if (!existingLead) {
        throw new Error('Lead not found');
      }

      if (existingLead.userId !== userId) {
        throw new Error('Unauthorized to delete this lead');
      }

      await prisma.lead.delete({
        where: { id: leadId },
      });

      return {
        success: true,
        message: 'Lead deleted successfully',
      };
    } catch (error) {
      throw error;
    }
  },

  async getLeadById(leadId: string, ctx: Context) {
    try {
      const lead = await ctx.prisma.lead.findUnique({
        where: { id: leadId },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lead not found',
        });
      }

      if (lead.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this lead',
        });
      }

      return lead;
    } catch (error) {
      if (error instanceof TRPCError) throw error;

      ctx.log.error({
        action: 'get-lead-by-id-failed',
        leadId: leadId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve lead',
      });
    }
  },

  async checkForDuplicates({ userId, leads, prisma }: DuplicateCheckParams) {
    const emailsToCheck = leads.filter((l) => l.email).map((l) => l.email!);
    const domainsToCheck = leads.filter((l) => l.domain).map((l) => l.domain!);

    const existingLeads = await (async () => {
      const orConditions: Prisma.LeadWhereInput[] = [];

      if (emailsToCheck.length > 0) {
        orConditions.push({
          email: { in: emailsToCheck },
        });
      }

      const nameDomainConditions = leads
        .filter((l) => l.domain && l.firstName && l.lastName)
        .map((l) => ({
          domain: l.domain!,
          firstName: l.firstName!,
          lastName: l.lastName!,
        }));

      if (nameDomainConditions.length > 0) {
        orConditions.push({
          OR: nameDomainConditions,
        });
      }

      if (orConditions.length === 0) {
        return [];
      }

      return prisma.lead.findMany({
        where: {
          userId,
          OR: orConditions,
        },
        select: {
          email: true,
          domain: true,
          firstName: true,
          lastName: true,
        },
      });
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
};
