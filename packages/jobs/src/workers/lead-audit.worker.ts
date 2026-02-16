import { ScraperService } from '../services/scraper.service';
import { calculateLeadScore } from '../services/scoring.utils';

const BATCH_SIZE = 20;

export function createLeadAuditWorker(db: any) {
  const scraper = new ScraperService();

  async function processLead(lead: any) {
    try {
      const auditData = await scraper.auditDomain(lead.domain);
      if (!auditData) return false;

      const primaryEmail =
        lead.email || (auditData.emails?.length > 0 ? auditData.emails[0] : null);
      const existingExtras = Array.isArray(lead.additionalEmails) ? lead.additionalEmails : [];
      const discoveredEmails = Array.isArray(auditData.emails) ? auditData.emails : [];

      const newExtras = discoveredEmails.filter((e: string) => e !== primaryEmail);
      const mergedExtras = [...new Set([...existingExtras, ...newExtras])];
      const score = calculateLeadScore(auditData);

      await db`
        UPDATE "Lead" SET
          "websiteAudit" = ${JSON.stringify(auditData)}::jsonb,
          "email" = ${primaryEmail},
          "additionalEmails" = ${db.array(mergedExtras)}::text[],
          "score" = ${score},
          "auditedAt" = NOW(),
          "updatedAt" = NOW()
        WHERE id = ${lead.id}
      `;
      return true;
    } catch (error) {
      console.error(`[LeadAuditWorker] Failed lead ${lead.id}:`, error);
      return false;
    }
  }

  async function updateProgress(params: {
    auditSessionId: string;
    userId: string;
    progress: number;
    successful: number;
    failed: number;
    total: number;
  }) {
    await db`
      UPDATE "AuditSession" SET 
        progress = ${params.progress}, 
        "updatedLeads" = ${params.successful}, 
        "failedLeads" = ${params.failed},
        "updatedAt" = NOW()
      WHERE id = ${params.auditSessionId}
    `;

    if ((global as any).events) {
      (global as any).events.emit(params.userId, 'audit-progress', {
        auditSessionId: params.auditSessionId,
        progress: params.progress,
        updatedLeads: params.successful,
        failedLeads: params.failed,
        totalLeads: params.total,
      });
    }
  }

  return {
    name: 'lead-audit',
    processor: async (job: any) => {
      const { auditSessionId, userId } = job.data;

      try {
        await db`UPDATE "AuditSession" SET status = 'PROCESSING', "startedAt" = NOW(), "updatedAt" = NOW() WHERE id = ${auditSessionId}`;

        const leads = await db`
          SELECT id, domain, email, "additionalEmails" FROM "Lead" 
          WHERE "userId" = ${userId} AND domain IS NOT NULL
        `;

        if (leads.length === 0) {
          await db`UPDATE "AuditSession" SET status = 'COMPLETED', progress = 100 WHERE id = ${auditSessionId}`;
          return;
        }

        let successfulCount = 0;
        let failedCount = 0;

        for (let i = 0; i < leads.length; i += BATCH_SIZE) {
          const chunk = leads.slice(i, i + BATCH_SIZE);

          const results = await Promise.all(chunk.map((lead) => processLead(lead)));

          results.forEach((res) => (res ? successfulCount++ : failedCount++));

          const progress = Math.min(Math.floor(((i + chunk.length) / leads.length) * 100), 100);
          await updateProgress({
            auditSessionId,
            userId,
            progress,
            successful: successfulCount,
            failed: failedCount,
            total: leads.length,
          });
        }

        await db`
          UPDATE "AuditSession" SET 
            status = 'COMPLETED', progress = 100, "completedAt" = NOW(), "updatedAt" = NOW() 
          WHERE id = ${auditSessionId}
        `;

        if ((global as any).events) {
          (global as any).events.emit(userId, 'audit-completed', {
            auditSessionId,
            updatedLeads: successfulCount,
          });
        }
      } catch (error: any) {
        console.error('Audit Worker Failed:', error);
        await db`UPDATE "AuditSession" SET status = 'FAILED', error = ${error.message}, "completedAt" = NOW() WHERE id = ${auditSessionId}`;
      }
    },
    options: { concurrency: 5, removeOnComplete: true },
  };
}
