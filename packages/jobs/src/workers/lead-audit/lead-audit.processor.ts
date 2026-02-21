import type { Job } from 'bullmq';
import { ScraperService } from '../../services/scraper.service';
import { SessionManager, ProgressTracker, CancellationChecker, BatchProcessor } from '../shared';
import type { JobEventEmitter } from '../../lib/job-event-emitter';
import { LeadAuditHelpers } from './lead-audit.helpers';
import type { LeadAuditJobData, Lead, ProcessResult, AuditStats } from './lead-audit.types';
import { prisma } from '@repo/database';

export class LeadAuditProcessor {
  private scraper = new ScraperService();
  private sessionManager = new SessionManager();
  private progressTracker = new ProgressTracker();
  private cancellationChecker = new CancellationChecker();
  private batchProcessor = new BatchProcessor();
  private helpers = new LeadAuditHelpers();

  private readonly BATCH_SIZE = 10;
  private readonly BATCH_DELAY_MS = 200;
  private readonly PROGRESS_UPDATE_INTERVAL = 5;

  async process(job: Job<LeadAuditJobData>, emitter: JobEventEmitter): Promise<any> {
    const { auditSessionId, userId, teamId } = job.data;

    const leads = await this.helpers.fetchLeads(userId, teamId);

    console.log(
      `[LeadAudit] Starting audit for ${leads.length} leads in parallel batches of ${this.BATCH_SIZE}`
    );

    await this.sessionManager.startAuditSession(auditSessionId, leads.length);

    const stats: AuditStats = {
      processedCount: 0,
      updatedLeads: 0,
      failedLeads: 0,
    };

    await this.processLeadsInBatches(leads, auditSessionId, userId, job, emitter, stats);

    await this.finalize(auditSessionId, emitter, stats, leads.length);

    return {
      updatedLeads: stats.updatedLeads,
      failedLeads: stats.failedLeads,
      totalLeads: leads.length,
    };
  }

  private async processLeadsInBatches(
    leads: Lead[],
    auditSessionId: string,
    userId: string,
    job: Job<LeadAuditJobData>,
    emitter: JobEventEmitter,
    stats: AuditStats
  ): Promise<void> {
    for (let batchStart = 0; batchStart < leads.length; batchStart += this.BATCH_SIZE) {
      if (await this.cancellationChecker.checkAuditCancellation(auditSessionId, job)) {
        await this.handleCancellation(auditSessionId, emitter, stats, leads.length);
        return;
      }

      const batch = leads.slice(batchStart, batchStart + this.BATCH_SIZE);
      await this.processBatch(batch, stats);

      const shouldUpdateProgress =
        stats.processedCount % this.PROGRESS_UPDATE_INTERVAL === 0 ||
        stats.processedCount === leads.length;

      if (shouldUpdateProgress) {
        await this.updateProgress(job, emitter, auditSessionId, stats, leads.length);
      }

      if (batchStart + this.BATCH_SIZE < leads.length) {
        await new Promise((resolve) => setTimeout(resolve, this.BATCH_DELAY_MS));
      }
    }
  }

  private async processBatch(batch: Lead[], stats: AuditStats): Promise<void> {
    const batchPromises = batch.map((lead) => this.processLead(lead));
    const results = await Promise.allSettled(batchPromises);

    for (const result of results) {
      stats.processedCount++;

      const category = this.helpers.categorizeResult(result);
      if (category === 'success') {
        stats.updatedLeads++;
      } else {
        stats.failedLeads++;
      }
    }
  }

  private async processLead(lead: Lead): Promise<ProcessResult> {
    try {
      const auditData = await this.scraper.auditDomain(lead.domain);

      if (auditData) {
        await this.helpers.updateLeadWithAudit(lead, auditData);
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
  }

  private async updateProgress(
    job: Job,
    emitter: JobEventEmitter,
    auditSessionId: string,
    stats: AuditStats,
    totalLeads: number
  ): Promise<void> {
    await this.sessionManager.updateAuditSession(auditSessionId, {
      progress: Math.floor((stats.processedCount / totalLeads) * 100),
      processedLeads: stats.processedCount,
      updatedLeads: stats.updatedLeads,
      failedLeads: stats.failedLeads,
    });

    await this.progressTracker.updateAuditProgress(job, emitter, auditSessionId, {
      processedCount: stats.processedCount,
      totalCount: totalLeads,
      updatedLeads: stats.updatedLeads,
      failedLeads: stats.failedLeads,
    });
  }

  private async handleCancellation(
    auditSessionId: string,
    emitter: JobEventEmitter,
    stats: AuditStats,
    totalLeads: number
  ): Promise<void> {
    console.log(
      `[LeadAudit] Audit cancelled for session ${auditSessionId} at ${stats.processedCount}/${totalLeads} leads`
    );

    await this.sessionManager.cancelAuditSession(auditSessionId, {
      processedLeads: stats.processedCount,
      updatedLeads: stats.updatedLeads,
      failedLeads: stats.failedLeads,
    });

    emitter.emit('audit-cancelled', {
      auditSessionId,
      processedLeads: stats.processedCount,
      updatedLeads: stats.updatedLeads,
      failedLeads: stats.failedLeads,
      totalLeads,
    });
  }

  private async finalize(
    auditSessionId: string,
    emitter: JobEventEmitter,
    stats: AuditStats,
    totalLeads: number
  ): Promise<void> {
    await this.sessionManager.completeAuditSession(auditSessionId);

    console.log(
      `[LeadAudit] Audit completed: ${stats.updatedLeads}/${totalLeads} leads updated, ${stats.failedLeads} failed`
    );

    emitter.emit('audit-completed', {
      auditSessionId,
      updatedLeads: stats.updatedLeads,
      failedLeads: stats.failedLeads,
      totalLeads,
    });
  }
}
