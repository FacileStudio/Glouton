import type { PrismaClient, UserOpportunityPreferences } from '@repo/database';
import { OpportunitySource, OpportunityCategory } from '@repo/database';
import { TRPCError } from '@trpc/server';
import type { QueueManager } from '@repo/jobs';

export class OpportunityService {
  static async getPreferences(db: PrismaClient, userId: string): Promise<UserOpportunityPreferences | null> {
    return db.userOpportunityPreferences.findUnique({
      where: { userId },
    });
  }

  static async updatePreferences(
    db: PrismaClient,
    userId: string,
    data: {
      discordWebhook?: string | null;
      enableDiscordNotifications?: boolean;
      enabledSources?: OpportunitySource[];
      enabledCategories?: OpportunityCategory[];
      keywords?: string[];
      excludeKeywords?: string[];
      minBudget?: number | null;
      remoteOnly?: boolean;
    }
  ): Promise<UserOpportunityPreferences> {
    return db.userOpportunityPreferences.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
      },
      update: data,
    });
  }

  static async testDiscordWebhook(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: '✅ Discord webhook test successful! You will receive opportunity notifications here.',
          embeds: [
            {
              title: 'Test Notification',
              description: 'This is a test notification from Glouton.',
              color: 0x7c3aed,
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });

      /**
       * if
       */
      if (!response.ok) {
        const errorText = await response.text();
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Discord webhook test failed: ${response.status} - ${errorText}`,
        });
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to send test notification',
      };
    }
  }
  static async list(
    db: PrismaClient,
    filters: {
      page?: number;
      limit?: number;
      sources?: string[];
      categories?: string[];
      remoteOnly?: boolean;
      minBudget?: number;
      maxBudget?: number;
      search?: string;
    }
  ) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    /**
     * skip
     */
    const skip = (page - 1) * limit;

    const where: any = {};

    /**
     * if
     */
    if (filters.sources && filters.sources.length > 0 && filters.sources.length < 16) {
      where.sourcePlatform = { in: filters.sources };
    }

    /**
     * if
     */
    if (filters.categories && filters.categories.length > 0 && filters.categories.length < 22) {
      where.category = { in: filters.categories };
    }

    /**
     * if
     */
    if (filters.remoteOnly) {
      where.isRemote = true;
    }

    /**
     * if
     */
    if (filters.minBudget !== undefined || filters.maxBudget !== undefined) {
      where.AND = where.AND || [];
      /**
       * if
       */
      if (filters.minBudget !== undefined) {
        where.AND.push({ budgetMin: { gte: filters.minBudget } });
      }
      /**
       * if
       */
      if (filters.maxBudget !== undefined) {
        where.AND.push({ budgetMax: { lte: filters.maxBudget } });
      }
    }

    /**
     * if
     */
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { company: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [opportunities, total] = await Promise.all([
      db.opportunity.findMany({
        where,
        orderBy: { postedAt: 'desc' },
        skip,
        take: limit,
      }),
      db.opportunity.count({ where }),
    ]);

    return {
      opportunities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getById(db: PrismaClient, id: string) {
    const opportunity = await db.opportunity.findUnique({
      where: { id },
    });

    /**
     * if
     */
    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    return opportunity;
  }

  static async getStats(db: PrismaClient) {
    const [total, remoteCount, bySource, byCategory, avgBudget] = await Promise.all([
      db.opportunity.count(),
      db.opportunity.count({ where: { isRemote: true } }),
      db.opportunity.groupBy({
        by: ['sourcePlatform'],
        _count: true,
      }),
      db.opportunity.groupBy({
        by: ['category'],
        _count: true,
      }),
      db.opportunity.aggregate({
        _avg: {
          budgetMin: true,
          budgetMax: true,
        },
      }),
    ]);

    const last24h = await db.opportunity.count({
      where: {
        scrapedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    const last7Days = await db.opportunity.count({
      where: {
        scrapedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    const withBudget = await db.opportunity.count({
      where: {
        OR: [{ budgetMin: { not: null } }, { budgetMax: { not: null } }],
      },
    });

    const lastScraped = await db.opportunity.findFirst({
      orderBy: { scrapedAt: 'desc' },
      select: { sourcePlatform: true, scrapedAt: true },
    });

    return {
      total,
      remoteCount,
      last24h,
      last7Days,
      withBudget,
      bySource: bySource.reduce(
        (acc, item) => {
          acc[item.sourcePlatform] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      byCategory: byCategory.reduce(
        (acc, item) => {
          acc[item.category] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      lastScraped: lastScraped
        ? {
            source: lastScraped.sourcePlatform,
            scrapedAt: lastScraped.scrapedAt,
          }
        : null,
      avgBudgetMin: avgBudget._avg.budgetMin ?? 0,
      avgBudgetMax: avgBudget._avg.budgetMax ?? 0,
    };
  }

  static async triggerManualScrape(jobs: QueueManager, sources: OpportunitySource[]) {
    const jobId = await jobs.addJob('opportunities', 'scrape-opportunities', {
      sources,
      triggeredAt: new Date().toISOString(),
      manual: true,
    });

    return {
      jobId,
      sources,
      status: 'queued',
    };
  }

  static async saveSearch(
    db: PrismaClient,
    userId: string,
    searchParams: {
      query?: string;
      sources?: OpportunitySource[];
      categories?: OpportunityCategory[];
      remoteOnly?: boolean;
      minBudget?: number;
      maxBudget?: number;
      resultsCount: number;
    }
  ) {
    return db.opportunitySearch.create({
      data: {
        userId,
        query: searchParams.query,
        sources: searchParams.sources || [],
        categories: searchParams.categories || [],
        remoteOnly: searchParams.remoteOnly || false,
        minBudget: searchParams.minBudget,
        maxBudget: searchParams.maxBudget,
        resultsCount: searchParams.resultsCount,
      },
    });
  }

  static async getSearchHistory(db: PrismaClient, userId: string, limit: number = 20) {
    return db.opportunitySearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  static async deleteSearchHistory(db: PrismaClient, userId: string, searchId?: string) {
    /**
     * if
     */
    if (searchId) {
      return db.opportunitySearch.delete({
        where: { id: searchId, userId },
      });
    }

    return db.opportunitySearch.deleteMany({
      where: { userId },
    });
  }

  static async getNewOpportunitiesSince(db: PrismaClient, since: Date) {
    return db.opportunity.findMany({
      where: {
        scrapedAt: {
          gte: since,
        },
      },
      orderBy: { scrapedAt: 'desc' },
    });
  }
}
