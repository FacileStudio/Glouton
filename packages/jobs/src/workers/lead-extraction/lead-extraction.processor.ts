import type { Job as BullJob } from 'bullmq';
import { LeadSourceFactory, type LeadData } from '@repo/lead-sources';
import { prisma } from '@repo/database';
import { Prisma } from '@prisma/client';
import type { JobEventEmitter } from '../../lib/job-event-emitter';
import { SessionManager, DeduplicationService, CancellationChecker } from '../shared';
import { LeadExtractionHelpers } from './lead-extraction.helpers';
import type { LeadExtractionData, SourceStats, ExtractionResult } from './lead-extraction.types';

export class LeadExtractionProcessor {
  private sessionManager = new SessionManager();
  private deduplicationService = new DeduplicationService();
  private cancellationChecker = new CancellationChecker();
  private helpers = new LeadExtractionHelpers();

  async process(job: BullJob<LeadExtractionData>, emitter: JobEventEmitter): Promise<void> {
    const { huntSessionId, userId, sources, companyName, filters } = job.data;

    console.log(`[LeadExtraction] Starting lead extraction for session ${huntSessionId}`);

    await this.sessionManager.startSession(huntSessionId);

    emitter.emit('extraction-started', {
      huntSessionId,
      sources,
      companyName,
      message: 'Starting lead extraction...',
    });

    await job.updateProgress(5);

    const apiKeys = await this.getApiKeys(userId);
    const hasApiKey = this.buildApiKeyMap(apiKeys);

    const result = await this.processSources(
      sources,
      userId,
      huntSessionId,
      companyName,
      filters,
      apiKeys,
      hasApiKey,
      job,
      emitter
    );

    await this.finalize(huntSessionId, result, emitter);
  }

  private async getApiKeys(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { hunterApiKey: true },
    });

    if (!user) throw new Error(`User ${userId} not found`);

    return { hunterApiKey: user.hunterApiKey };
  }

  private buildApiKeyMap(apiKeys: { hunterApiKey: string | null }): Record<string, boolean> {
    return {
      HUNTER: !!apiKeys.hunterApiKey,
      MANUAL: true,
    };
  }

  private async processSources(
    sources: string[],
    userId: string,
    huntSessionId: string,
    companyName: string | undefined,
    filters: any,
    apiKeys: any,
    hasApiKey: Record<string, boolean>,
    job: BullJob<LeadExtractionData>,
    emitter: JobEventEmitter
  ): Promise<ExtractionResult> {
    const sourceStats: Record<string, SourceStats> = {};
    let totalLeads = 0;
    let successfulLeads = 0;
    let failedLeads = 0;

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      sourceStats[source] = { leads: 0, errors: 0, rateLimited: false };

      if (await this.cancellationChecker.checkHuntCancellation(job)) {
        emitter.emit('extraction-cancelled', {
          huntSessionId,
          message: 'Extraction cancelled by user',
        });
        break;
      }

      const result = await this.processSource(
        source,
        userId,
        huntSessionId,
        companyName,
        filters,
        apiKeys,
        hasApiKey,
        sourceStats,
        emitter
      );

      totalLeads += result.total;
      successfulLeads += result.successful;

      const progress = Math.floor(((i + 1) / sources.length) * 90) + 5;
      await job.updateProgress(progress);

      emitter.emit('extraction-progress', {
        huntSessionId,
        currentSource: source,
        sourcesCompleted: i + 1,
        totalSources: sources.length,
        leadsFound: successfulLeads,
        progress,
        message: `Completed ${i + 1} of ${sources.length} sources`,
      });
    }

    return { totalLeads, successfulLeads, failedLeads, sourceStats };
  }

  private async processSource(
    source: string,
    userId: string,
    huntSessionId: string,
    companyName: string | undefined,
    filters: any,
    apiKeys: any,
    hasApiKey: Record<string, boolean>,
    sourceStats: Record<string, SourceStats>,
    emitter: JobEventEmitter
  ): Promise<{ total: number; successful: number }> {
    console.log(`[LeadExtraction] Processing source: ${source}`);

    if (!hasApiKey[source]) {
      console.warn(`[LeadExtraction] No API key configured for ${source}`);
      sourceStats[source].errors++;

      emitter.emit('extraction-error', {
        huntSessionId,
        source,
        error: `No API credentials configured for ${source}`,
        message: `Skipping ${source} - API credentials not configured`,
      });

      return { total: 0, successful: 0 };
    }

    let extractedLeads: LeadData[] = [];

    try {
      emitter.emit('source-started', {
        huntSessionId,
        source,
        message: `Extracting leads from ${source}...`,
      });

      const provider = LeadSourceFactory.create(source as any, apiKeys);
      const searchFilters = this.helpers.buildSearchFilters(filters);
      const result = await provider.search(searchFilters);
      extractedLeads = result.leads;

      console.log(`[LeadExtraction] Found ${extractedLeads.length} leads from ${source}`);

      emitter.emit('leads-discovered', {
        huntSessionId,
        source,
        count: extractedLeads.length,
        message: `Found ${extractedLeads.length} leads from ${source}`,
      });
    } catch (apiError: any) {
      return this.handleSourceError(apiError, source, huntSessionId, sourceStats, emitter);
    }

    return await this.insertLeads(
      extractedLeads,
      userId,
      huntSessionId,
      source,
      companyName,
      sourceStats,
      emitter
    );
  }

  private handleSourceError(
    apiError: any,
    source: string,
    huntSessionId: string,
    sourceStats: Record<string, SourceStats>,
    emitter: JobEventEmitter
  ): { total: number; successful: number } {
    console.error(`[LeadExtraction] API error for ${source}:`, apiError);
    sourceStats[source].errors++;

    if (apiError.message?.includes('rate limit') || apiError.statusCode === 429) {
      sourceStats[source].rateLimited = true;
      emitter.emit('rate-limit-reached', {
        huntSessionId,
        source,
        message: `Rate limit reached for ${source}, skipping...`,
      });
    } else {
      emitter.emit('extraction-error', {
        huntSessionId,
        source,
        error: apiError.message || 'Unknown API error',
        message: `Error extracting from ${source}: ${apiError.message}`,
      });
    }

    return { total: 0, successful: 0 };
  }

  private async insertLeads(
    extractedLeads: LeadData[],
    userId: string,
    huntSessionId: string,
    source: string,
    companyName: string | undefined,
    sourceStats: Record<string, SourceStats>,
    emitter: JobEventEmitter
  ): Promise<{ total: number; successful: number }> {
    const mappedLeads = this.helpers.mapLeadsToDatabase(extractedLeads, companyName);

    const domainOnlyLeads = mappedLeads.filter((l) => !l.email && !!l.domain);
    const emailLeads = mappedLeads.filter((l) => !!l.email);

    const existing = await this.deduplicationService.findExistingLeads(userId, {
      domains: domainOnlyLeads.map((l) => l.domain),
      emails: emailLeads.map((l) => l.email!),
    });

    const newLeads = mappedLeads.filter((lead) => {
      if (lead.email) return !existing.emails.has(lead.email);
      if (lead.domain) return !existing.domains.has(lead.domain);
      return false;
    });

    console.log(`[LeadExtraction] Found ${newLeads.length} new unique leads from ${source}`);

    if (newLeads.length === 0) {
      if (extractedLeads.length > 0) {
        emitter.emit('leads-duplicate', {
          huntSessionId,
          source,
          count: extractedLeads.length,
          message: `All ${extractedLeads.length} leads from ${source} were already in database`,
        });
      }
      return { total: extractedLeads.length, successful: 0 };
    }

    const leadsToInsert = newLeads.map((lead) =>
      this.helpers.prepareLeadInsert(lead, userId, huntSessionId, source)
    );

    const insertedLeads = await prisma.lead.createMany({
      data: leadsToInsert,
      skipDuplicates: true,
    });

    sourceStats[source].leads = insertedLeads.count;
    console.log(`[LeadExtraction] Inserted ${insertedLeads.count} leads from ${source}`);

    emitter.emit('leads-created', {
      huntSessionId,
      source,
      count: insertedLeads.count,
      totalSoFar: insertedLeads.count,
      message: `Added ${insertedLeads.count} new leads from ${source}`,
    });

    return { total: extractedLeads.length, successful: insertedLeads.count };
  }

  private async finalize(
    huntSessionId: string,
    result: ExtractionResult,
    emitter: JobEventEmitter
  ): Promise<void> {
    await this.sessionManager.completeSession(huntSessionId, {
      totalLeads: result.totalLeads,
      successfulLeads: result.successfulLeads,
      failedLeads: result.failedLeads,
    });

    await this.sessionManager.updateSession(huntSessionId, {
      sourceStats: result.sourceStats as Prisma.InputJsonValue,
    });

    console.log(`[LeadExtraction] Completed extraction for session ${huntSessionId}`);

    emitter.emit('extraction-completed', {
      huntSessionId,
      totalLeads: result.totalLeads,
      successfulLeads: result.successfulLeads,
      failedLeads: result.failedLeads,
      sourceStats: result.sourceStats,
      message: `Lead extraction completed! Found ${result.successfulLeads} new leads from ${result.totalLeads} total results`,
    });
  }
}
