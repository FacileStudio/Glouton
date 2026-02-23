import type { Job as BullJob } from 'bullmq';
import { MapsOrchestrator, type LocalBusiness } from '@repo/maps';
import { prisma } from '@repo/database';
import { Prisma } from '@prisma/client';
import type { JobEventEmitter } from '../../lib/job-event-emitter';
import { SessionManager, CancellationChecker } from '../shared';
import { LocalBusinessHuntHelpers } from './local-business-hunt.helpers';
import type { LocalBusinessHuntData } from './local-business-hunt.types';

export class LocalBusinessHuntProcessor {
  private sessionManager = new SessionManager();
  private cancellationChecker = new CancellationChecker();
  private helpers = new LocalBusinessHuntHelpers();

  async process(job: BullJob<LocalBusinessHuntData>, emitter: JobEventEmitter): Promise<any> {
    const {
      huntSessionId,
      userId,
      teamId,
      location,
      category,
      hasWebsite,
      radius = 5000,
      maxResults = 20,
      googleMapsApiKey,
    } = job.data;

    console.log(`[LocalBusinessHunt] Starting hunt for ${category} in ${location}`);

    const currentSession = await this.checkSession(huntSessionId);
    if (!currentSession) return;

    await this.startSessionIfNeeded(huntSessionId, currentSession, location, category, hasWebsite, radius, emitter);
    await job.updateProgress(10);

    if (await this.cancellationChecker.checkHuntCancellation(job)) {
      return await this.handleCancellation(huntSessionId, currentSession, emitter);
    }

    const mapsOrchestrator = this.createMapsOrchestrator(googleMapsApiKey);
    const businessesFound = await this.searchBusinesses(
      mapsOrchestrator,
      location,
      category,
      radius,
      maxResults,
      hasWebsite,
      huntSessionId,
      emitter
    );

    if (await this.cancellationChecker.checkHuntCancellation(job)) {
      return await this.handleCancellation(huntSessionId, currentSession, emitter);
    }

    await job.updateProgress(50);

    const successCount = await this.processBusinesses(
      businessesFound,
      userId,
      teamId,
      huntSessionId,
      location,
      category,
      job,
      emitter
    );

    await this.finalizeHunt(huntSessionId, successCount, location, category, emitter);
    await job.updateProgress(100);
  }

  private async checkSession(huntSessionId: string) {
    const currentSession = await prisma.huntSession.findUnique({
      where: { id: huntSessionId },
      select: { status: true, totalLeads: true, successfulLeads: true, filters: true },
    });

    if (!currentSession) {
      console.warn(`[LocalBusinessHunt] Session ${huntSessionId} not found, skipping job`);
      return null;
    }

    return currentSession;
  }

  private async startSessionIfNeeded(
    huntSessionId: string,
    currentSession: any,
    location: string,
    category: string,
    hasWebsite: boolean | undefined,
    radius: number,
    emitter: JobEventEmitter
  ): Promise<void> {
    if (currentSession.status === 'PENDING') {
      await this.sessionManager.startSession(huntSessionId);

      emitter.emit('hunt-started', {
        huntSessionId,
        huntType: 'LOCAL_BUSINESS',
        location,
        category,
        hasWebsite,
        radius,
        message: `Starting search for ${category} businesses in ${location}`,
      });

      emitter.emit('hunt-processing', {
        huntSessionId,
        startedAt: new Date().toISOString(),
      });
    }
  }

  private createMapsOrchestrator(googleMapsApiKey?: string): MapsOrchestrator {
    return new MapsOrchestrator({
      googleMapsApiKey,
      useGoogleMaps: !!googleMapsApiKey,
      useOpenStreetMap: true,
    });
  }

  private async searchBusinesses(
    mapsOrchestrator: MapsOrchestrator,
    location: string,
    category: string,
    radius: number,
    maxResults: number,
    hasWebsite: boolean | undefined,
    huntSessionId: string,
    emitter: JobEventEmitter
  ): Promise<LocalBusiness[]> {
    try {
      console.log(`[LocalBusinessHunt] Searching for ${category} businesses in ${location}`);

      const randomDelay = Math.floor(Math.random() * 2000);
      await new Promise(resolve => setTimeout(resolve, randomDelay));

      const safeMaxResults = Math.min(maxResults, 500);

      const businessesFound = await mapsOrchestrator.search({
        location,
        category,
        radius,
        maxResults: safeMaxResults,
        hasWebsite,
      });

      const limitedBusinesses = businessesFound.slice(0, safeMaxResults);

      if (businessesFound.length > safeMaxResults) {
        console.log(`[LocalBusinessHunt] Limited results from ${businessesFound.length} to ${safeMaxResults} for memory protection`);
      }

      console.log(`[LocalBusinessHunt] Found ${limitedBusinesses.length} businesses from map services`);

      if (limitedBusinesses.length > 0) {
        emitter.emit('businesses-discovered', {
          huntSessionId,
          count: limitedBusinesses.length,
          location,
          category,
          sources: Array.from(new Set(limitedBusinesses.map(b => b.source))),
        });
      }

      return limitedBusinesses;
    } catch (error) {
      console.error('[LocalBusinessHunt] Maps search failed:', error);

      emitter.emit('hunt-error', {
        huntSessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        location,
        category,
      });

      throw new Error(`Failed to search for businesses: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processBusinesses(
    businesses: LocalBusiness[],
    userId: string,
    teamId: string | null | undefined,
    huntSessionId: string,
    location: string,
    category: string,
    job: BullJob<LocalBusinessHuntData>,
    emitter: JobEventEmitter
  ): Promise<number> {
    if (businesses.length === 0) return 0;

    const newBusinesses = await this.filterExistingBusinesses(businesses, userId, teamId, location);

    if (await this.cancellationChecker.checkHuntCancellation(job)) {
      return 0;
    }

    const validBusinesses = newBusinesses.filter(b => this.helpers.isValidBusiness(b));

    if (validBusinesses.length === 0) return 0;

    return await this.insertBusinesses(
      validBusinesses,
      userId,
      teamId,
      huntSessionId,
      location,
      category,
      emitter
    );
  }

  private async filterExistingBusinesses(
    businesses: LocalBusiness[],
    userId: string,
    teamId: string | null | undefined,
    location: string
  ): Promise<LocalBusiness[]> {
    const domains = Array.from(new Set(businesses.map(b => b.website).filter(Boolean))) as string[];
    const names = Array.from(new Set(businesses.map(b => b.name).filter(Boolean))) as string[];
    const potentialEmails = this.helpers.preparePotentialEmails(businesses, location);

    const whereClause: any = {
      OR: [
        { domain: { in: domains } },
        { businessName: { in: names } },
        ...(potentialEmails.length > 0 ? [{ email: { in: potentialEmails } }] : []),
      ],
    };

    if (teamId) {
      whereClause.teamId = teamId;
    } else {
      whereClause.userId = userId;
      whereClause.teamId = null;
    }

    const existingLeads = await prisma.lead.findMany({
      where: whereClause,
      select: { domain: true, businessName: true, email: true },
    });

    const existingKeys = new Set(
      existingLeads.flatMap((l: any) => [l.domain, l.businessName].filter(Boolean))
    );

    return businesses.filter(b => {
      const domain = this.helpers.extractDomain(b.website);

      if (existingKeys.has(domain) || existingKeys.has(b.name)) {
        return false;
      }

      const generatedEmail = this.helpers.generateEmail(b, location);
      if (generatedEmail && existingKeys.has(generatedEmail)) {
        return false;
      }

      return true;
    });
  }

  private async insertBusinesses(
    validBusinesses: LocalBusiness[],
    userId: string,
    teamId: string | null | undefined,
    huntSessionId: string,
    location: string,
    category: string,
    emitter: JobEventEmitter
  ): Promise<number> {
    const leadsToInsert = validBusinesses.map(business =>
      this.helpers.prepareLeadData(business, userId, huntSessionId, category, location, teamId)
    );

    const deduplicatedLeads = this.helpers.deduplicateByEmail(leadsToInsert, lead => lead.email);

    console.log(`[LocalBusinessHunt] Deduplicated ${leadsToInsert.length} leads to ${deduplicatedLeads.length} unique leads`);

    const leadsWithEmail = deduplicatedLeads.filter(lead => lead.email);
    const leadsWithoutEmail = deduplicatedLeads.filter(lead => !lead.email);

    console.log(`[LocalBusinessHunt] ${leadsWithEmail.length} leads with email, ${leadsWithoutEmail.length} without`);

    const BATCH_SIZE = 50;
    const EVENT_BATCH_INTERVAL = 10;
    let totalInserted = 0;

    for (let i = 0; i < leadsWithEmail.length; i += BATCH_SIZE) {
      const batch = leadsWithEmail.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(leadsWithEmail.length / BATCH_SIZE);

      try {
        const result = await prisma.lead.createMany({
          data: batch,
          skipDuplicates: true,
        });

        totalInserted += result.count;
      } catch (error) {
        console.error(`[LocalBusinessHunt] Error inserting batch:`, error);
      }

      const batchProgress = Math.min(90, 50 + Math.floor(((i + batch.length) / deduplicatedLeads.length) * 40));

      const shouldEmitEvent = batchNumber % EVENT_BATCH_INTERVAL === 0 || batchNumber === totalBatches;

      if (shouldEmitEvent) {
        emitter.emit('hunt-progress', {
          huntSessionId,
          progress: batchProgress,
          totalLeads: totalInserted,
          successfulLeads: totalInserted,
          location,
          category,
          status: 'PROCESSING',
        });

        emitter.emit('leads-created', {
          huntSessionId,
          count: totalInserted,
          location,
          category,
          message: `Found ${totalInserted} new ${category} businesses in ${location}`,
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (leadsWithoutEmail.length > 0) {
      console.log(`[LocalBusinessHunt] Inserting ${leadsWithoutEmail.length} leads without email`);

      const totalBatchesNoEmail = Math.ceil(leadsWithoutEmail.length / BATCH_SIZE);

      for (let i = 0; i < leadsWithoutEmail.length; i += BATCH_SIZE) {
        const batch = leadsWithoutEmail.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

        try {
          const created = await prisma.lead.createMany({
            data: batch,
            skipDuplicates: true,
          });

          totalInserted += created.count;

          const shouldEmitEvent = batchNumber % EVENT_BATCH_INTERVAL === 0 || batchNumber === totalBatchesNoEmail;

          if (created.count > 0 && shouldEmitEvent) {
            emitter.emit('leads-created', {
              huntSessionId,
              count: totalInserted,
              location,
              category,
              message: `Found ${totalInserted} new ${category} businesses in ${location}`,
            });
          }
        } catch (error) {
          console.error(`[LocalBusinessHunt] Error inserting leads without email:`, error);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (totalInserted > 0) {
      console.log(`[LocalBusinessHunt] Inserted ${totalInserted} new leads`);
    }

    return totalInserted;
  }

  private async finalizeHunt(
    huntSessionId: string,
    successCount: number,
    location: string,
    category: string,
    emitter: JobEventEmitter
  ): Promise<void> {
    const result = await prisma.$transaction(async (tx) => {
      const currentSessionData = await tx.huntSession.findUnique({
        where: { id: huntSessionId },
        select: { totalLeads: true, successfulLeads: true, filters: true },
      });

      const currentFilters = (currentSessionData?.filters as any) || {};
      const completedJobs = (currentFilters.completedJobs || 0) + 1;
      const totalJobs = currentFilters.totalJobs || 1;

      const updatedSession = await tx.huntSession.update({
        where: { id: huntSessionId },
        data: {
          totalLeads: { increment: successCount },
          successfulLeads: { increment: successCount },
          filters: {
            ...currentFilters,
            completedJobs,
          } as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
        select: { totalLeads: true, successfulLeads: true, filters: true },
      });

      const finalTotalLeads = updatedSession.totalLeads || 0;
      const finalSuccessfulLeads = updatedSession.successfulLeads || 0;
      const isCompleted = completedJobs >= totalJobs;
      const progressPercent = isCompleted ? 100 : Math.min(95, Math.floor((completedJobs / totalJobs) * 100));

      await tx.huntSession.update({
        where: { id: huntSessionId },
        data: {
          status: isCompleted ? 'COMPLETED' : 'PROCESSING',
          progress: progressPercent,
          completedAt: isCompleted ? new Date() : null,
          updatedAt: new Date(),
        },
      });

      return {
        finalTotalLeads,
        finalSuccessfulLeads,
        isCompleted,
        progressPercent,
        completedJobs,
        totalJobs,
      };
    });

    console.log(`[LocalBusinessHunt] Job completed for ${category} in ${location} (${result.completedJobs}/${result.totalJobs})`);

    emitter.emit('hunt-progress', {
      huntSessionId,
      progress: result.progressPercent,
      totalLeads: result.finalTotalLeads,
      successfulLeads: result.finalSuccessfulLeads,
      location,
      category,
      status: result.isCompleted ? 'COMPLETED' : 'PROCESSING',
    });

    if (result.isCompleted) {
      console.log(`[LocalBusinessHunt] All jobs completed! Emitting hunt-completed event`);
      emitter.emit('hunt-completed', {
        huntSessionId,
        totalLeads: result.finalTotalLeads,
        successfulLeads: result.finalSuccessfulLeads,
        location,
        category,
        message: `Hunt completed! Found ${result.finalSuccessfulLeads} ${category} businesses in ${location}`,
      });
    }
  }

  private async handleCancellation(
    huntSessionId: string,
    currentSession: any,
    emitter: JobEventEmitter
  ): Promise<any> {
    console.log(`[LocalBusinessHunt] Hunt cancelled for session ${huntSessionId}`);

    await this.sessionManager.cancelSession(huntSessionId);

    emitter.emit('hunt-cancelled', {
      huntSessionId,
      totalLeads: currentSession.totalLeads || 0,
      successfulLeads: currentSession.successfulLeads || 0,
    });

    return { cancelled: true };
  }
}
