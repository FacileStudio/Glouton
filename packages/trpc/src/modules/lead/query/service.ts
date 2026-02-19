import { SQL, sql } from 'bun';
import type { LeadStatus } from '@repo/database';
import { TRPCError } from '@trpc/server';

function sqlJoin(fragments: any[], separator: any): any {
  return fragments.reduce((acc: any, item: any, i: number) =>
    i === 0 ? item : sql`${acc}${separator}${item}`
  );
}

export interface GetLeadsParams {
  userId: string;
  db: SQL;
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
  db: SQL;
}

export interface Context {
  user: { id: string };
  db: SQL;
  log: {
    info: (data: any) => void;
    error: (data: any) => void;
  };
}

export default {
  async getLeads({ userId, db, filters }: GetLeadsParams) {
    const conditions = [db`"userId" = ${userId}`];

    if (filters?.status) conditions.push(db`status = ${filters.status}`);

    if (filters?.country) conditions.push(db`country ILIKE ${`%${filters.country}%`}`);

    if (filters?.city) conditions.push(db`city ILIKE ${`%${filters.city}%`}`);

    if (filters?.category) conditions.push(db`category = ${filters.category}`);

    if (filters?.businessType) conditions.push(db`"businessType" = ${filters.businessType}`);

    if (filters?.contacted !== undefined) conditions.push(db`contacted = ${filters.contacted}`);

    if (filters?.hasWebsite === true) conditions.push(db`"hasWebsite" = true`);
    if (filters?.hasWebsite === false) conditions.push(db`("hasWebsite" IS NULL OR "hasWebsite" = false)`);

    if (filters?.hasSocial === true) conditions.push(db`("socialProfiles" IS NOT NULL AND jsonb_typeof("socialProfiles") = 'array' AND jsonb_array_length("socialProfiles") > 0)`);
    if (filters?.hasSocial === false) conditions.push(db`("socialProfiles" IS NULL OR jsonb_typeof("socialProfiles") != 'array' OR jsonb_array_length("socialProfiles") = 0)`);

    if (filters?.hasPhone === true) conditions.push(db`("phoneNumbers" IS NOT NULL AND "phoneNumbers"::text != '{}')`);
    if (filters?.hasPhone === false) conditions.push(db`("phoneNumbers" IS NULL OR "phoneNumbers"::text = '{}')`);

    if (filters?.hasGps === true) conditions.push(db`coordinates IS NOT NULL`);
    if (filters?.hasGps === false) conditions.push(db`coordinates IS NULL`);

    if (filters?.hasEmail === true) conditions.push(db`email IS NOT NULL`);
    if (filters?.hasEmail === false) conditions.push(db`email IS NULL`);

    if (filters?.search) {
      const s = `%${filters.search}%`;
      conditions.push(db`(
      domain ILIKE ${s} OR
      email ILIKE ${s} OR
      "firstName" ILIKE ${s} OR
      "lastName" ILIKE ${s} OR
      "businessName" ILIKE ${s}
    )`);
    }

    const whereClause = conditions.reduce((acc, curr) => db`${acc} AND ${curr}`);

    let limit = filters?.limit ?? 50;
    let offset = ((filters?.page ?? 1) - 1) * limit;

    const sortDir = filters?.sortOrder === 'asc' ? sql`ASC` : sql`DESC`;
    const orderBy = (() => {
      switch (filters?.sortBy) {
        case 'domain':    return sql`domain ${sortDir} NULLS LAST`;
        case 'email':     return sql`email ${sortDir} NULLS LAST`;
        case 'city':      return sql`city ${sortDir} NULLS LAST`;
        case 'country':   return sql`country ${sortDir} NULLS LAST`;
        case 'score':     return sql`score ${sortDir} NULLS LAST`;
        case 'status':    return sql`status ${sortDir} NULLS LAST`;
        default:          return sql`"createdAt" ${sortDir}`;
      }
    })();

    const [leads, totalResult] = await Promise.all([
      db`
      SELECT
        id, domain, email, "firstName", "lastName", "businessName", city, country, status, score, technologies,
        "additionalEmails", "phoneNumbers", "physicalAddresses", "socialProfiles", "companyInfo",
        "websiteAudit", "scrapedAt", "auditedAt", "huntSessionId", contacted, "lastContactedAt",
        "emailsSentCount", "createdAt", coordinates, "hasWebsite", "businessType", category
      FROM "Lead"
      WHERE ${whereClause}
      ORDER BY ${orderBy}
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

  async getStats(userId: string, db: SQL): Promise<LeadStats> {
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
          COUNT(*) FILTER (WHERE "phoneNumbers" IS NOT NULL AND "phoneNumbers"::text <> '{}')::INT as phones,
          COUNT(*) FILTER (WHERE domain IS NOT NULL)::INT as domains,
          COUNT(*) FILTER (WHERE "socialProfiles" IS NOT NULL AND jsonb_typeof("socialProfiles") = 'array' AND jsonb_array_length("socialProfiles") > 0)::INT as socials,
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
        totalDomains: ls.domains || 0,
        totalSocials: ls.socials || 0,
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

  async getActiveSessions(ctx: Context) {
    try {
      const [activeAudits, activeHunts] = await Promise.all([
        ctx.db`
          SELECT
            id, status, progress, "totalLeads", "processedLeads",
            "updatedLeads", "failedLeads", "currentDomain", "startedAt", "createdAt"
          FROM "AuditSession"
          WHERE "userId" = ${ctx.user.id} AND status IN ('PENDING', 'PROCESSING')
          ORDER BY "createdAt" DESC
        ` as Promise<any[]>,
        ctx.db`
          SELECT
            id, status, progress, "totalLeads",
            "successfulLeads", "failedLeads", "startedAt", "createdAt"
          FROM "HuntSession"
          WHERE "userId" = ${ctx.user.id} AND status IN ('PENDING', 'PROCESSING')
          ORDER BY "createdAt" DESC
        ` as Promise<any[]>,
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

  async deleteLead(leadId: string, userId: string, db: SQL) {
    try {
      const [existingLead] = (await db`
        SELECT id, "userId"
        FROM "Lead"
        WHERE id = ${leadId}
      `) as any[];

      if (!existingLead) {
        throw new Error('Lead not found');
      }

      if (existingLead.userId !== userId) {
        throw new Error('Unauthorized to delete this lead');
      }

      await db`
        DELETE FROM "Lead"
        WHERE id = ${leadId}
      `;

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
      const [lead] = (await ctx.db`
        SELECT * FROM "Lead"
        WHERE id = ${leadId}
        LIMIT 1
      `) as any[];

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

  async checkForDuplicates({ userId, leads, db }: DuplicateCheckParams) {
    const emailsToCheck = leads.filter((l) => l.email).map((l) => l.email!);
    const domainsToCheck = leads.filter((l) => l.domain).map((l) => l.domain!);

    const existingLeads = await (async () => {
      const conditions = [sql`"userId" = ${userId}`];

      const emailConditions =
        emailsToCheck.length > 0
          ? sql`email IN (${sqlJoin(emailsToCheck.map((e) => sql`${e}`), sql`, `)})`
          : null;

      const nameDomainConditions = leads
        .filter((l) => l.domain && l.firstName && l.lastName)
        .map(
          (l) =>
            sql`(domain = ${l.domain!} AND "firstName" = ${l.firstName!} AND "lastName" = ${l.lastName!})`
        );
      const nameDomainCombinedConditions =
        nameDomainConditions.length > 0 ? sqlJoin(nameDomainConditions, sql` OR `) : null;

      const orConditions = [];
      if (emailConditions) {
        orConditions.push(emailConditions);
      }
      if (nameDomainCombinedConditions) {
        orConditions.push(nameDomainCombinedConditions);
      }

      if (orConditions.length > 0) {
        conditions.push(sql`(${sqlJoin(orConditions, sql` OR `)})`);
      }

      const whereClause =
        conditions.length > 0 ? sql`WHERE ${sqlJoin(conditions, sql` AND `)}` : sql``;

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
};