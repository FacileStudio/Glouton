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

      const businessesFound = await mapsOrchestrator.search({
        location,
        category,
        radius,
        maxResults,
        hasWebsite,
      });

      console.log(`[LocalBusinessHunt] Found ${businessesFound.length} businesses from map services`);

      if (businessesFound.length > 0) {
        emitter.emit('businesses-discovered', {
          huntSessionId,
          count: businessesFound.length,
          location,
          category,
          sources: Array.from(new Set(businessesFound.map(b => b.source))),
        });
      }

      return businessesFound;
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
    huntSessionId: string,
    location: string,
    category: string,
    job: BullJob<LocalBusinessHuntData>,
    emitter: JobEventEmitter
  ): Promise<number> {
    if (businesses.length === 0) return 0;

    const newBusinesses = await this.filterExistingBusinesses(businesses, userId, location);

    if (await this.cancellationChecker.checkHuntCancellation(job)) {
      return 0;
    }

    const validBusinesses = newBusinesses.filter(b => this.helpers.isValidBusiness(b));

    if (validBusinesses.length === 0) return 0;

    return await this.insertBusinesses(
      validBusinesses,
      userId,
      huntSessionId,
      location,
      category,
      emitter
    );
  }

  private async filterExistingBusinesses(
    businesses: LocalBusiness[],
    userId: string,
    location: string
  ): Promise<LocalBusiness[]> {
    const domains = Array.from(new Set(businesses.map(b => b.website).filter(Boolean))) as string[];
    const names = Array.from(new Set(businesses.map(b => b.name).filter(Boolean))) as string[];
    const potentialEmails = this.helpers.preparePotentialEmails(businesses, location);

    const existingLeads = await prisma.lead.findMany({
      where: {
        userId,
        OR: [
          { domain: { in: domains } },
          { businessName: { in: names } },
          ...(potentialEmails.length > 0 ? [{ email: { in: potentialEmails } }] : []),
        ],
      },
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
    huntSessionId: string,
    location: string,
    category: string,
    emitter: JobEventEmitter
  ): Promise<number> {
    const leadsToInsert = validBusinesses.map(business =>
      this.helpers.prepareLeadData(business, userId, huntSessionId, category, location)
    );

    const deduplicatedLeads = this.helpers.deduplicateByEmail(leadsToInsert, lead => lead.email);

    console.log(`[LocalBusinessHunt] Deduplicated ${leadsToInsert.length} leads to ${deduplicatedLeads.length} unique leads`);

    const BATCH_SIZE = 50;
    let totalInserted = 0;
    let totalUpdated = 0;

    for (let i = 0; i < deduplicatedLeads.length; i += BATCH_SIZE) {
      const batch = deduplicatedLeads.slice(i, i + BATCH_SIZE);

      const operations = batch.map((lead) =>
        prisma.lead.upsert({
          where: {
            userId_email: {
              userId: lead.userId,
              email: lead.email!,
            },
          },
          create: lead,
          update: {
            businessName: lead.businessName ?? undefined,
            domain: lead.domain ?? undefined,
            city: lead.city ?? undefined,
            country: lead.country ?? undefined,
            phoneNumbers: lead.phoneNumbers.length > 0 ? lead.phoneNumbers : undefined,
            physicalAddresses: lead.physicalAddresses.length > 0 ? lead.physicalAddresses : undefined,
            hasWebsite: lead.hasWebsite ?? undefined,
            coordinates: lead.coordinates ?? undefined,
            updatedAt: new Date(),
          },
        })
      );

      const results = await prisma.$transaction(operations);

      const batchInserted = results.filter((result) => {
        return result.createdAt.getTime() === result.updatedAt.getTime();
      });
      const batchUpdated = results.length - batchInserted.length;
      totalInserted += batchInserted.length;
      totalUpdated += batchUpdated;

      const batchProgress = Math.min(90, 50 + Math.floor(((i + batch.length) / deduplicatedLeads.length) * 40));

      emitter.emit('hunt-progress', {
        huntSessionId,
        progress: batchProgress,
        totalLeads: totalInserted,
        successfulLeads: totalInserted,
        location,
        category,
        status: 'PROCESSING',
      });

      if (batchInserted.length > 0) {
        emitter.emit('leads-created', {
          huntSessionId,
          count: batchInserted.length,
          location,
          category,
          message: `Found ${batchInserted.length} new ${category} businesses in ${location}`,
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (totalInserted > 0) {
      console.log(`[LocalBusinessHunt] Inserted ${totalInserted} new leads`);
    }
    if (totalUpdated > 0) {
      console.log(`[LocalBusinessHunt] Updated ${totalUpdated} existing leads`);
      emitter.emit('leads-updated', {
        huntSessionId,
        count: totalUpdated,
        location,
        category,
        message: `Updated ${totalUpdated} existing ${category} businesses in ${location}`,
      });
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
    const currentSessionData = await prisma.huntSession.findUnique({
      where: { id: huntSessionId },
      select: { totalLeads: true, successfulLeads: true, filters: true },
    });

    const currentFilters = (currentSessionData?.filters as any) || {};
    const completedJobs = (currentFilters.completedJobs || 0) + 1;
    const totalJobs = currentFilters.totalJobs || 1;

    const updatedSession = await prisma.huntSession.update({
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

    await prisma.huntSession.update({
      where: { id: huntSessionId },
      data: {
        status: isCompleted ? 'COMPLETED' : 'PROCESSING',
        progress: progressPercent,
        completedAt: isCompleted ? new Date() : null,
        updatedAt: new Date(),
      },
    });

    emitter.emit('hunt-progress', {
      huntSessionId,
      progress: progressPercent,
      totalLeads: finalTotalLeads,
      successfulLeads: finalSuccessfulLeads,
      location,
      category,
      status: isCompleted ? 'COMPLETED' : 'PROCESSING',
    });

    if (isCompleted) {
      emitter.emit('hunt-completed', {
        huntSessionId,
        totalLeads: finalTotalLeads,
        successfulLeads: finalSuccessfulLeads,
        location,
        category,
        message: `Hunt completed! Found ${finalSuccessfulLeads} ${category} businesses in ${location}`,
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
