import { SQL, sql } from 'bun';
import { TRPCError } from '@trpc/server';
import type { QueueManager } from '@repo/jobs';

export class OpportunityService {
  static async getPreferences(db: SQL, userId: string): Promise<UserOpportunityPreferences | null> {
    const [preferences] = await db`
      SELECT *
      FROM "UserOpportunityPreferences"
      WHERE "userId" = ${userId}
    ` as Promise<any[]>;
    return preferences || null;
  }

  static async updatePreferences(
    db: SQL,
    userId: string,
    data: {
      discordWebhook?: string | null;
      enableDiscordNotifications?: boolean;
      enabledSources?: any[];
      enabledCategories?: any[];
      keywords?: string[];
      excludeKeywords?: string[];
      minBudget?: number | null;
      remoteOnly?: boolean;
    }
  ): Promise<any> {
    const [updatedPreferences] = await db`
      INSERT INTO "UserOpportunityPreferences" (
        "userId", "discordWebhook", "enableDiscordNotifications", "enabledSources", "enabledCategories",
        keywords, "excludeKeywords", "minBudget", "remoteOnly", "createdAt", "updatedAt"
      ) VALUES (
        ${userId},
        ${data.discordWebhook ?? null},
        ${data.enableDiscordNotifications ?? false},
        ${data.enabledSources ? JSON.stringify(data.enabledSources) : '[]'}::jsonb,
        ${data.enabledCategories ? JSON.stringify(data.enabledCategories) : '[]'}::jsonb,
        ${data.keywords ? JSON.stringify(data.keywords) : '[]'}::jsonb,
        ${data.excludeKeywords ? JSON.stringify(data.excludeKeywords) : '[]'}::jsonb,
        ${data.minBudget ?? null},
        ${data.remoteOnly ?? false},
        NOW(),
        NOW()
      )
      ON CONFLICT ("userId") DO UPDATE SET
        "discordWebhook" = COALESCE(EXCLUDED."discordWebhook", "UserOpportunityPreferences"."discordWebhook"),
        "enableDiscordNotifications" = COALESCE(EXCLUDED."enableDiscordNotifications", "UserOpportunityPreferences"."enableDiscordNotifications"),
        "enabledSources" = COALESCE(EXCLUDED."enabledSources", "UserOpportunityPreferences"."enabledSources"),
        "enabledCategories" = COALESCE(EXCLUDED."enabledCategories", "UserOpportunityPreferences"."enabledCategories"),
        keywords = COALESCE(EXCLUDED.keywords, "UserOpportunityPreferences".keywords),
        "excludeKeywords" = COALESCE(EXCLUDED."excludeKeywords", "UserOpportunityPreferences"."excludeKeywords"),
        "minBudget" = COALESCE(EXCLUDED."minBudget", "UserOpportunityPreferences"."minBudget"),
        "remoteOnly" = COALESCE(EXCLUDED."remoteOnly", "UserOpportunityPreferences"."remoteOnly"),
        "updatedAt" = NOW()
      RETURNING *
    ` as Promise<any[]>;
    return updatedPreferences;
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
    db: SQL,
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
    const offset = (page - 1) * limit;

    const conditions = [];

    if (filters.sources && filters.sources.length > 0 && filters.sources.length < 16) {
      conditions.push(sql`"sourcePlatform" IN (${sql.join(filters.sources.map(s => sql`${s}`))})`);
    }

    if (filters.categories && filters.categories.length > 0 && filters.categories.length < 22) {
      conditions.push(sql`category IN (${sql.join(filters.categories.map(c => sql`${c}`))})`);
    }

    if (filters.remoteOnly) {
      conditions.push(sql`"isRemote" = TRUE`);
    }

    if (filters.minBudget !== undefined) {
      conditions.push(sql`"budgetMin" >= ${filters.minBudget}`);
    }
    if (filters.maxBudget !== undefined) {
      conditions.push(sql`"budgetMax" <= ${filters.maxBudget}`);
    }

    if (filters.search) {
      const searchConditions = [
        sql`title ILIKE '%' || ${filters.search} || '%'`,
        sql`description ILIKE '%' || ${filters.search} || '%'`,
        sql`company ILIKE '%' || ${filters.search} || '%'`,
      ];
      conditions.push(sql`(${sql.join(searchConditions, sql` OR `)})`);
    }

    const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

    const [opportunities, totalResult] = await Promise.all([
      db`
        SELECT *
        FROM "Opportunity"
        ${whereClause}
        ORDER BY "postedAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as Promise<any[]>,
      db`SELECT COUNT(*)::int as count FROM "Opportunity" ${whereClause}` as Promise<[{ count: number }]>,
    ]);

    const total = totalResult[0]?.count || 0;

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

  static async getById(db: SQL, id: string) {
    const [opportunity] = await db`
      SELECT *
      FROM "Opportunity"
      WHERE id = ${id}
    ` as Promise<any[]>;

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    return opportunity;
  }

  static async getStats(db: SQL) {
    const [
      [totalResult],
      [remoteCountResult],
      bySource,
      byCategory,
      [avgBudget],
      [last24hResult],
      [last7DaysResult],
      [withBudgetResult],
      [lastScraped]
    ] = await Promise.all([
      db`SELECT COUNT(*)::int as count FROM "Opportunity"` as Promise<any[]>,
      db`SELECT COUNT(*)::int as count FROM "Opportunity" WHERE "isRemote" = TRUE` as Promise<any[]>,
      db`SELECT "sourcePlatform", COUNT(*)::int as _count FROM "Opportunity" GROUP BY "sourcePlatform"` as Promise<any[]>,
      db`SELECT category, COUNT(*)::int as _count FROM "Opportunity" GROUP BY category` as Promise<any[]>,
      db`SELECT AVG("budgetMin") as "avgMin", AVG("budgetMax") as "avgMax" FROM "Opportunity"` as Promise<any[]>,
      db`SELECT COUNT(*)::int as count FROM "Opportunity" WHERE "scrapedAt" >= NOW() - INTERVAL '24 hours'` as Promise<any[]>,
      db`SELECT COUNT(*)::int as count FROM "Opportunity" WHERE "scrapedAt" >= NOW() - INTERVAL '7 days'` as Promise<any[]>,
      db`SELECT COUNT(*)::int as count FROM "Opportunity" WHERE "budgetMin" IS NOT NULL OR "budgetMax" IS NOT NULL` as Promise<any[]>,
      db`SELECT "sourcePlatform", "scrapedAt" FROM "Opportunity" ORDER BY "scrapedAt" DESC LIMIT 1` as Promise<any[]>,
    ]);

    return {
      total: totalResult?.count || 0,
      remoteCount: remoteCountResult?.count || 0,
      last24h: last24hResult?.count || 0,
      last7Days: last7DaysResult?.count || 0,
      withBudget: withBudgetResult?.count || 0,
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
      avgBudgetMin: Number(avgBudget?.avgMin) || 0,
      avgBudgetMax: Number(avgBudget?.avgMax) || 0,
    };
  }

  static async triggerManualScrape(jobs: QueueManager, sources: any[]) {
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
    db: SQL,
    userId: string,
    searchParams: {
      query?: string;
      sources?: any[];
      categories?: any[];
      remoteOnly?: boolean;
      minBudget?: number;
      maxBudget?: number;
      resultsCount: number;
    }
  ) {
    const [search] = await db`
      INSERT INTO "OpportunitySearch" (
        "userId", query, sources, categories, "remoteOnly", "minBudget", "maxBudget", "resultsCount", "createdAt"
      ) VALUES (
        ${userId},
        ${searchParams.query ?? null},
        ${searchParams.sources ? JSON.stringify(searchParams.sources) : '[]'}::jsonb,
        ${searchParams.categories ? JSON.stringify(searchParams.categories) : '[]'}::jsonb,
        ${searchParams.remoteOnly ?? false},
        ${searchParams.minBudget ?? null},
        ${searchParams.maxBudget ?? null},
        ${searchParams.resultsCount},
        NOW()
      )
      RETURNING *
    ` as Promise<any[]>;
    return search;
  }

  static async getSearchHistory(db: SQL, userId: string, limit: number = 20) {
    return db`
      SELECT *
      FROM "OpportunitySearch"
      WHERE "userId" = ${userId}
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    ` as Promise<any[]>;
  }

  static async deleteSearchHistory(db: SQL, userId: string, searchId?: string) {
    if (searchId) {
      return db`
        DELETE FROM "OpportunitySearch"
        WHERE id = ${searchId} AND "userId" = ${userId}
        RETURNING *
      ` as Promise<any[]>;
    }

    return db`
      DELETE FROM "OpportunitySearch"
      WHERE "userId" = ${userId}
      RETURNING *
    ` as Promise<any[]>;
  }

  static async getNewOpportunitiesSince(db: SQL, since: Date) {
    return db`
      SELECT *
      FROM "Opportunity"
      WHERE "scrapedAt" >= ${since}
      ORDER BY "scrapedAt" DESC
    ` as Promise<any[]>;
  }
}
