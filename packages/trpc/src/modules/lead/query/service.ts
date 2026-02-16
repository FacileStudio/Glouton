export default {
  getLeads: async ({ userId, db, filters }: GetLeadsParams) => {
    const conditions = [db`"userId" = ${userId}`];

    if (filters?.status) conditions.push(db`status = ${filters.status}`);

    if (filters?.country) conditions.push(db`country ILIKE ${`%${filters.country}%`}`);

    if (filters?.city) conditions.push(db`city ILIKE ${`%${filters.city}%`}`);

    if (filters?.search) {
      const s = `%${filters.search}%`;
      conditions.push(db`(
      domain ILIKE ${s} OR 
      email ILIKE ${s} OR 
      "firstName" ILIKE ${s} OR 
      "lastName" ILIKE ${s}
    )`);
    }

    const whereClause = conditions.reduce((acc, curr) => db`${acc} AND ${curr}`);

    let limit = filters?.limit ?? 50;
    let offset = ((filters?.page ?? 1) - 1) * limit;

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
  getActiveSessions: async (ctx) => {
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
            id, "targetUrl", status, progress, "totalLeads", 
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
  deleteLead: async (leadId: string, ctx: Context) => {
    try {
      const result = await leadService.deleteLead(input.leadId, ctx.user.id, ctx.db);

      ctx.log.info({
        action: 'delete-lead',
        leadId: input.leadId,
      });

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';

      if (msg === 'Unauthorized to delete this lead') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Unauthorized access' });
      }
      if (msg === 'Lead not found') {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lead not found' });
      }

      ctx.log.error({
        action: 'delete-lead-failed',
        leadId: input.leadId,
        error: msg,
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete lead',
      });
    }
  },
  getLeadById: async (leadId: string, ctx: Context) => {
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
};
