import type { Job as BullJob } from 'bullmq';
import { HunterService } from '@repo/hunter';
import { prisma } from '@repo/database';
import type { JobEventEmitter } from '../../lib/job-event-emitter';
import { SessionManager, ProgressTracker, DeduplicationService, CancellationChecker } from '../shared';
import { DomainFinderHelpers } from './domain-finder.helpers';
import type { DomainFinderData, CompanyData } from './domain-finder.types';

export class DomainFinderProcessor {
  private sessionManager = new SessionManager();
  private progressTracker = new ProgressTracker();
  private deduplicationService = new DeduplicationService();
  private cancellationChecker = new CancellationChecker();
  private helpers = new DomainFinderHelpers();

  async process(job: BullJob<DomainFinderData>, emitter: JobEventEmitter): Promise<void> {
    const { huntSessionId, userId, teamId, filters } = job.data;

    await this.sessionManager.startSession(huntSessionId);
    emitter.emit('hunt-started', {
      huntSessionId,
      message: 'Starting domain discovery with Hunter.io...',
    });

    await job.updateProgress(5);

    const user = await this.getUser(userId);
    const hunter = new HunterService(user.hunterApiKey);

    const discoverFilters = this.helpers.buildDiscoverFilters(job.data);
    const result = await hunter.discover(discoverFilters);

    if (!result || result.data.length === 0) {
      await this.handleNoResults(huntSessionId, emitter);
      return;
    }

    const companies = result.data.filter((c) => !!c.domain) as CompanyData[];
    await job.updateProgress(10);

    const newCompanies = await this.deduplicateCompanies(companies, userId, teamId);

    console.log(
      `[DomainFinder] ${newCompanies.length} new domains after dedup (${companies.length - newCompanies.length} duplicates skipped)`
    );

    const successfulLeads = await this.processCompanies(
      newCompanies,
      userId,
      huntSessionId,
      job,
      emitter
    );

    await this.sessionManager.completeSession(huntSessionId, {
      totalLeads: newCompanies.length,
      successfulLeads,
    });

    await job.updateProgress(100);

    emitter.emit('hunt-completed', {
      huntSessionId,
      totalLeads: newCompanies.length,
      successfulLeads,
      message: `Domain discovery completed! Found ${successfulLeads} new domains`,
    });

    console.log(
      `[DomainFinder] Completed for session ${huntSessionId}: ${successfulLeads}/${newCompanies.length} domains inserted`
    );
  }

  private async getUser(userId: string): Promise<{ hunterApiKey: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { hunterApiKey: true },
    });

    if (!user) throw new Error(`User ${userId} not found`);
    if (!user.hunterApiKey) throw new Error('Hunter.io API key not configured');

    return { hunterApiKey: user.hunterApiKey };
  }

  private async handleNoResults(huntSessionId: string, emitter: JobEventEmitter): Promise<void> {
    await this.sessionManager.completeSession(huntSessionId, {
      totalLeads: 0,
      successfulLeads: 0,
    });

    emitter.emit('hunt-completed', {
      huntSessionId,
      totalLeads: 0,
      successfulLeads: 0,
      message: 'Domain discovery completed — no domains found',
    });
  }

  private async deduplicateCompanies(
    companies: CompanyData[],
    userId: string,
    teamId?: string | null
  ): Promise<CompanyData[]> {
    const domains = companies.map((c) => c.domain);
    const existingDomains = await this.deduplicationService.findExistingLeadsByDomains(
      userId,
      domains,
      teamId
    );

    return companies.filter((c) => !existingDomains.has(c.domain));
  }

  private async processCompanies(
    companies: CompanyData[],
    userId: string,
    huntSessionId: string,
    job: BullJob<DomainFinderData>,
    emitter: JobEventEmitter
  ): Promise<number> {
    let successfulLeads = 0;
    const totalToProcess = companies.length;

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];

      if (await this.cancellationChecker.checkHuntCancellation(job)) {
        await this.sessionManager.cancelSession(huntSessionId);
        emitter.emit('hunt-cancelled', { huntSessionId, successfulLeads });
        return successfulLeads;
      }

      try {
        await this.helpers.createLeadFromCompany(company, userId, huntSessionId);
        successfulLeads++;

        const progress = Math.floor(10 + ((i + 1) / totalToProcess) * 85);

        emitter.emit('domain-discovered', {
          huntSessionId,
          domain: company.domain,
          organization: company.organization || null,
          industry: company.industry || null,
          totalDiscovered: successfulLeads,
          progress,
          message: `Discovered ${company.organization || company.domain}`,
        });

        emitter.emit('hunt-progress', {
          huntSessionId,
          progress,
          successfulLeads,
          totalLeads: totalToProcess,
          status: 'PROCESSING',
        });

        await this.sessionManager.updateSession(huntSessionId, {
          progress,
          successfulLeads,
          totalLeads: i + 1,
        });
      } catch (err) {
        console.error(`[DomainFinder] Error inserting domain ${company.domain}:`, err);
      }
    }

    return successfulLeads;
  }
}
