import { ScraperService } from '../services/scraper.service';
import { calculateLeadScore } from '../services/scoring.utils';
import type { Job } from 'bullmq';
import type { AuditResult } from '../services/scraper.service';
import type { EventEmitter } from './index';
import { JobEventEmitter } from '../lib/job-event-emitter';
import { prisma } from '@repo/database';

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

export function createLeadAuditWorker(events: EventEmitter) {
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

        const now = new Date();
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            websiteAudit: auditData as any,
            email: primaryEmail,
            additionalEmails: mergedExtras,
            score: calculatedScore,
            auditedAt: now,
            updatedAt: now,
          },
        });

        return { success: true, lead, auditData };
      } else {
        return { success: false, lead };
      }
    } catch (error) {
      return {
        success: false,
        lead,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  };

  const updateProgress = async (
    job: Job,
    emitter: JobEventEmitter,
    auditSessionId: string,
    processedCount: number,
    totalCount: number,
    updatedLeads: number,
    failedLeads: number
  ) => {
    const progress = Math.floor((processedCount / totalCount) * 100);

    await job.updateProgress(progress);

    await prisma.auditSession.update({
      where: { id: auditSessionId },
      data: {
        progress,
        processedLeads: processedCount,
        updatedLeads,
        failedLeads,
        updatedAt: new Date(),
      },
    });

    emitter.emit('audit-progress', {
      auditSessionId,
      progress,
      processedLeads: processedCount,
      updatedLeads,
      failedLeads,
      totalLeads: totalCount,
    });
  };

  return {
    name: 'lead-audit',
    processor: async (job: Job<LeadAuditJobData>) => {
      const { auditSessionId, userId } = job.data;
      const emitter = new JobEventEmitter(events, userId);
      let isCancelled = false;

      const checkCancellation = async () => {
        const session = await prisma.auditSession.findUnique({
          where: { id: auditSessionId },
          select: { status: true },
        });

        if (session && session.status === 'CANCELLED') {
          isCancelled = true;
          return true;
        }

        if ((await job.isFailed()) || (await job.isCompleted())) {
          isCancelled = true;
          return true;
        }
        return false;
      };

      try {
        const leads: Lead[] = await prisma.lead.findMany({
          where: {
            userId,
            domain: { not: null },
          },
          select: {
            id: true,
            domain: true,
            email: true,
            additionalEmails: true,
          },
        }) as Lead[];

        console.log(
          `[WORKER] Starting audit for ${leads.length} leads in parallel batches of ${BATCH_SIZE}`
        );

        const startedAt = new Date();
        await prisma.auditSession.update({
          where: { id: auditSessionId },
          data: {
            status: 'PROCESSING',
            totalLeads: leads.length,
            startedAt,
            updatedAt: startedAt,
          },
        });

        let processedCount = 0;
        let updatedLeads = 0;
        let failedLeads = 0;

        for (let batchStart = 0; batchStart < leads.length; batchStart += BATCH_SIZE) {
          if (await checkCancellation()) {
            console.log(
              `[WORKER] Audit cancelled for session ${auditSessionId} at ${processedCount}/${leads.length} leads`
            );

            const currentSession = await prisma.auditSession.findUnique({
              where: { id: auditSessionId },
              select: { status: true, completedAt: true },
            });

            if (currentSession?.status !== 'COMPLETED') {
              await prisma.auditSession.update({
                where: { id: auditSessionId },
                data: {
                  progress: Math.floor((processedCount / leads.length) * 100),
                  processedLeads: processedCount,
                  updatedLeads,
                  failedLeads,
                  completedAt: currentSession?.completedAt || new Date(),
                  updatedAt: new Date(),
                },
              });
            }

            emitter.emit('audit-cancelled', {
              auditSessionId,
              processedLeads: processedCount,
              updatedLeads,
              failedLeads,
              totalLeads: leads.length,
            });

            return {
              cancelled: true,
              updatedLeads,
              failedLeads,
              processedLeads: processedCount,
              totalLeads: leads.length,
            };
          }

          const batch = leads.slice(batchStart, batchStart + BATCH_SIZE);
          const batchPromises = batch.map((lead) => processLead(lead));

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
            processedCount % PROGRESS_UPDATE_INTERVAL === 0 || processedCount === leads.length;

          if (shouldUpdateProgress) {
            await updateProgress(
              job,
              emitter,
              auditSessionId,
              processedCount,
              leads.length,
              updatedLeads,
              failedLeads
            );
          }

          if (batchStart + BATCH_SIZE < leads.length)
            await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }

        await updateProgress(
          job,
          emitter,
          auditSessionId,
          processedCount,
          leads.length,
          updatedLeads,
          failedLeads
        );

        const completedAt = new Date();
        await prisma.auditSession.update({
          where: { id: auditSessionId },
          data: {
            status: 'COMPLETED',
            progress: 100,
            completedAt,
            updatedAt: completedAt,
          },
        });

        console.log(
          `[WORKER] Audit completed: ${updatedLeads}/${leads.length} leads updated, ${failedLeads} failed`
        );

        emitter.emit('audit-completed', {
          auditSessionId,
          updatedLeads,
          failedLeads,
          totalLeads: leads.length,
        });

        return { updatedLeads, failedLeads, totalLeads: leads.length };
      } catch (fatalError: any) {
        console.error('[WORKER] Fatal Error:', fatalError);
        const failedAt = new Date();
        await prisma.auditSession.update({
          where: { id: auditSessionId },
          data: {
            status: 'FAILED',
            error: fatalError.message,
            completedAt: failedAt,
            updatedAt: failedAt,
          },
        });

        throw fatalError;
      }
    },
    options: { concurrency: 5 },
  };
}
