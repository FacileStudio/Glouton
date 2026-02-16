import { ScraperService } from '../services/scraper.service';
import { calculateLeadScore } from '../services/scoring.utils';

export function createLeadAuditWorker(db: any) {
  const scraper = new ScraperService();

  return {
    name: 'lead-audit',
    processor: async (job: any) => {
      const { auditSessionId, userId } = job.data;

      try {
        await db`
          UPDATE "AuditSession" SET 
            status = 'PROCESSING', 
            "startedAt" = NOW(),
            "updatedAt" = NOW() 
          WHERE id = ${auditSessionId}
        `;

        const leads = await db`
          SELECT id, domain, email, "additionalEmails" 
          FROM "Lead" 
          WHERE "userId" = ${userId} AND domain IS NOT NULL
        `;

        let updatedLeads = 0;
        let failedLeads = 0;

        for (let i = 0; i < leads.length; i++) {
          const lead = leads[i];

          try {
            const auditData = await scraper.auditDomain(lead.domain);

            if (auditData) {
              const primaryEmail = lead.email || auditData.emails?.[0] || null;

              const existingExtras = Array.isArray(lead.additionalEmails)
                ? lead.additionalEmails
                : [];
              const discoveredEmails = Array.isArray(auditData.emails) ? auditData.emails : [];
              const newExtras = discoveredEmails.filter((e: string) => e !== primaryEmail);
              const mergedExtras = [...new Set([...existingExtras, ...newExtras])];

              const calculatedScore = calculateLeadScore(auditData);

              await db`
                UPDATE "Lead" SET
                  "websiteAudit" = ${auditData},
                  "email" = ${primaryEmail},
                  "additionalEmails" = ${db.array(mergedExtras)},
                  "score" = ${calculatedScore},
                  "auditedAt" = NOW(),
                  "updatedAt" = NOW()
                WHERE id = ${lead.id}
              `;

              updatedLeads++;
            } else {
              console.warn(`[SCRAPER] No data returned for ${lead.domain}`);
              failedLeads++;
            }
          } catch (itemError: any) {
            console.error(`[WORKER] Individual lead failed (${lead.domain}):`, itemError.message);
            failedLeads++;
          }

          if (i % 5 === 0 || i === leads.length - 1) {
            const progress = Math.floor(((i + 1) / leads.length) * 100);
            await job.updateProgress(progress);

            await db`
              UPDATE "AuditSession" SET 
                progress = ${progress}, 
                "updatedLeads" = ${updatedLeads}, 
                "failedLeads" = ${failedLeads},
                "updatedAt" = NOW()
              WHERE id = ${auditSessionId}
            `;

            if ((global as any).events) {
              (global as any).events.emit(userId, 'audit-progress', {
                auditSessionId,
                progress,
                updatedLeads,
                failedLeads,
                totalLeads: leads.length,
              });
            }
          }

          await new Promise((res) => setTimeout(res, 600));
        }

        await db`
          UPDATE "AuditSession" SET 
            status = 'COMPLETED', progress = 100, 
            "completedAt" = NOW(), "updatedAt" = NOW() 
          WHERE id = ${auditSessionId}
        `;

        if ((global as any).events) {
          (global as any).events.emit(userId, 'audit-completed', { auditSessionId, updatedLeads });
        }
      } catch (fatalError: any) {
        console.error('[WORKER] Fatal Error:', fatalError);
        await db`
          UPDATE "AuditSession" SET 
            status = 'FAILED', error = ${fatalError.message},
            "completedAt" = NOW(), "updatedAt" = NOW() 
          WHERE id = ${auditSessionId}
        `;
      }
    },
    options: { concurrency: 5 },
  };
}
