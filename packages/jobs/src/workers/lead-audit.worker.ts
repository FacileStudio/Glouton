import { ScraperService } from '../services/scraper.service';
import { calculateLeadScore } from '../services/scoring.utils';
import type { Job } from 'bullmq';
import type { AuditResult } from '../services/scraper.service';
import type { EventEmitter } from './index';

interface LeadAuditJobData {
  auditSessionId: string;
  userId: string;
}

interface Lead {
  id: string;
  domain: string;
  email: string | null;
  additionalEmails: string[];
}

interface ProcessResult {
  success: boolean;
  lead: Lead;
  auditData?: AuditResult | null;
  error?: Error;
}

export function createLeadAuditWorker(db: any, events: EventEmitter) {
  const scraper = new ScraperService();
  const BATCH_SIZE = 10;
  const BATCH_DELAY_MS = 200;
  const PROGRESS_UPDATE_INTERVAL = 5;

  const processLead = async (lead: Lead): Promise<ProcessResult> => {
    try {
      const auditData = await scraper.auditDomain(lead.domain);

      if (auditData) {
        const primaryEmail = lead.email || auditData.emails?.[0] || null;
        const existingExtras = Array.isArray(lead.additionalEmails) ? lead.additionalEmails : [];
        const discoveredEmails = Array.isArray(auditData.emails) ? auditData.emails : [];
        const newExtras = discoveredEmails.filter((e: string) => e !== primaryEmail);
        const mergedExtras = Array.from(new Set([...existingExtras, ...newExtras]));
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

        return { success: true, lead, auditData };
      } else {
        return { success: false, lead };
      }
    } catch (error) {
      return {
        success: false,
        lead,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };

  const updateProgress = async (
    job: Job,
    auditSessionId: string,
    userId: string,
    processedCount: number,
    totalCount: number,
    updatedLeads: number,
    failedLeads: number
  ) => {
    const progress = Math.floor((processedCount / totalCount) * 100);

    await job.updateProgress(progress);

    await db`
      UPDATE "AuditSession" SET
        progress = ${progress},
        "processedLeads" = ${processedCount},
        "updatedLeads" = ${updatedLeads},
        "failedLeads" = ${failedLeads},
        "updatedAt" = NOW()
      WHERE id = ${auditSessionId}
    `;

    if (events) {
      events.emit(userId, 'audit-progress', {
        auditSessionId,
        progress,
        processedLeads: processedCount,
        updatedLeads,
        failedLeads,
        totalLeads: totalCount,
      });
    }
  };

  return {
    name: 'lead-audit',
    processor: async (job: Job<LeadAuditJobData>) => {
      const { auditSessionId, userId } = job.data;
      let isCancelled = false;

      // Set up cancellation checker - checks database for session status
      const checkCancellation = async () => {
        // Check if the session has been marked as CANCELLED in the database
        const [session] = await db`
          SELECT status
          FROM "AuditSession"
          WHERE id = ${auditSessionId}
        `;

        if (session && session.status === 'CANCELLED') {
          isCancelled = true;
          return true;
        }

        // Also check job status as a fallback
        if (await job.isFailed() || await job.isCompleted()) {
          isCancelled = true;
          return true;
        }
        return false;
      };

      try {
        const leads: Lead[] = await db`
          SELECT id, domain, email, "additionalEmails"
          FROM "Lead"
          WHERE "userId" = ${userId} AND domain IS NOT NULL
        `;

        console.log(`[WORKER] Starting audit for ${leads.length} leads in parallel batches of ${BATCH_SIZE}`);

        // Update session with totalLeads count and set status to PROCESSING
        await db`
          UPDATE "AuditSession" SET
            status = 'PROCESSING',
            "totalLeads" = ${leads.length},
            "startedAt" = NOW(),
            "updatedAt" = NOW()
          WHERE id = ${auditSessionId}
        `;

        let processedCount = 0;
        let updatedLeads = 0;
        let failedLeads = 0;

        for (let batchStart = 0; batchStart < leads.length; batchStart += BATCH_SIZE) {
          // Check for cancellation before processing each batch
          if (await checkCancellation()) {
            console.log(`[WORKER] Audit cancelled for session ${auditSessionId} at ${processedCount}/${leads.length} leads`);

            // Only update progress stats if not already cancelled
            // The status might already be CANCELLED if cancel() was called
            await db`
              UPDATE "AuditSession" SET
                progress = ${Math.floor((processedCount / leads.length) * 100)},
                "processedLeads" = ${processedCount},
                "updatedLeads" = ${updatedLeads},
                "failedLeads" = ${failedLeads},
                "completedAt" = COALESCE("completedAt", NOW()),
                "updatedAt" = NOW()
              WHERE id = ${auditSessionId}
                AND status != 'COMPLETED'
            `;

            if (events) {
              events.emit(userId, 'audit-cancelled', {
                auditSessionId,
                processedLeads: processedCount,
                updatedLeads,
                failedLeads,
                totalLeads: leads.length
              });
            }

            return {
              cancelled: true,
              updatedLeads,
              failedLeads,
              processedLeads: processedCount,
              totalLeads: leads.length
            };
          }

          const batch = leads.slice(batchStart, batchStart + BATCH_SIZE);
          const batchPromises = batch.map(lead => processLead(lead));

          const results = await Promise.allSettled(batchPromises);

          for (const result of results) {
            processedCount++;

            if (result.status === 'fulfilled' && result.value.success) {
              updatedLeads++;
            } else if (result.status === 'fulfilled' && !result.value.success) {
              failedLeads++;
              if (result.value.error) {
                console.error(
                  `[WORKER] Lead audit failed for ${result.value.lead.domain}: ${result.value.error.message}`
                );
              }
            } else if (result.status === 'rejected') {
              failedLeads++;
              console.error('[WORKER] Unexpected batch processing error:', result.reason);
            }
          }

          const shouldUpdateProgress =
            processedCount % PROGRESS_UPDATE_INTERVAL === 0 ||
            processedCount === leads.length;

          if (shouldUpdateProgress) {
            await updateProgress(
              job,
              auditSessionId,
              userId,
              processedCount,
              leads.length,
              updatedLeads,
              failedLeads
            );
          }

          if (batchStart + BATCH_SIZE < leads.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
          }
        }

        await updateProgress(
          job,
          auditSessionId,
          userId,
          processedCount,
          leads.length,
          updatedLeads,
          failedLeads
        );

        await db`
          UPDATE "AuditSession" SET
            status = 'COMPLETED',
            progress = 100,
            "completedAt" = NOW(),
            "updatedAt" = NOW()
          WHERE id = ${auditSessionId}
        `;

        console.log(`[WORKER] Audit completed: ${updatedLeads}/${leads.length} leads updated, ${failedLeads} failed`);

        if (events) {
          events.emit(userId, 'audit-completed', {
            auditSessionId,
            updatedLeads,
            failedLeads,
            totalLeads: leads.length
          });
        }

        return { updatedLeads, failedLeads, totalLeads: leads.length };
      } catch (fatalError: any) {
        console.error('[WORKER] Fatal Error:', fatalError);
        await db`
          UPDATE "AuditSession" SET
            status = 'FAILED',
            error = ${fatalError.message},
            "completedAt" = NOW(),
            "updatedAt" = NOW()
          WHERE id = ${auditSessionId}
        `;

        throw fatalError;
      }
    },
    options: { concurrency: 5 },
  };
}
