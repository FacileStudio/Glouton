import type { JobDefinition } from '../types';
import { Job as BullJob } from 'bullmq';
import { HunterService, type HunterDiscoverFilters } from '@repo/hunter';
import type { EventEmitter } from './index';
import { JobEventEmitter } from '../lib/job-event-emitter';
import { prisma } from '@repo/database';

export interface DomainFinderData {
  huntSessionId: string;
  userId: string;
  filters?: {
    location?: {
      continent?: string;
      businessRegion?: string;
      country?: string;
      state?: string;
      city?: string;
    };
    industry?: string | string[];
    headcount?: string | string[];
    query?: string;
    limit?: number;
  };
}

export function createDomainFinderWorker(
  events: EventEmitter
): JobDefinition<DomainFinderData, void> {
  return {
    name: 'domain-finder',
    processor: async (job: BullJob<DomainFinderData>) => {
      const { huntSessionId, userId, filters } = job.data;
      const emitter = new JobEventEmitter(events, userId);

      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { hunterApiKey: true },
        });

        if (!user) throw new Error(`User ${userId} not found`);
        if (!user.hunterApiKey) throw new Error('Hunter.io API key not configured');

        const startedAt = new Date();
        await prisma.huntSession.update({
          where: { id: huntSessionId },
          data: {
            status: 'PROCESSING',
            startedAt,
            updatedAt: startedAt,
          },
        });

        emitter.emit('hunt-started', {
          huntSessionId,
          message: 'Starting domain discovery with Hunter.io...',
        });

        await job.updateProgress(5);

        const hunter = new HunterService(user.hunterApiKey);

        const discoverFilters: HunterDiscoverFilters = {
          limit: filters?.limit || 100,
        };

        if (filters?.location) {
          const loc = filters.location;
          if (loc.continent || loc.businessRegion || loc.country || loc.state || loc.city) {
            discoverFilters.headquarters_location = {
              include: [
                {
                  continent: loc.continent,
                  business_region: loc.businessRegion as any,
                  country: loc.country,
                  state: loc.state,
                  city: loc.city,
                },
              ],
            };
          }
        }

        if (filters?.query) discoverFilters.query = filters.query;

        if (filters?.industry) {
          discoverFilters.industry = {
            include: [filters.industry].flat(),
          };
        }

        if (filters?.headcount) {
          discoverFilters.headcount = [filters.headcount].flat();
        }

        const result = await hunter.discover(discoverFilters);

        if (!result || result.data.length === 0) {
          const completedAt = new Date();
          await prisma.huntSession.update({
            where: { id: huntSessionId },
            data: {
              status: 'COMPLETED',
              progress: 100,
              totalLeads: 0,
              successfulLeads: 0,
              completedAt,
              updatedAt: completedAt,
            },
          });

          emitter.emit('hunt-completed', {
            huntSessionId,
            totalLeads: 0,
            successfulLeads: 0,
            message: 'Domain discovery completed — no domains found',
          });

          return;
        }

        const companies = result.data.filter((c) => !!c.domain);

        await job.updateProgress(10);

        const domains = companies.map((c) => c.domain);

        const existing = await prisma.lead.findMany({
          where: {
            userId,
            email: null,
            domain: { in: domains },
          },
          select: { domain: true },
        });

        const existingDomains = new Set(existing.map((l) => l.domain));
        const newCompanies = companies.filter((c) => !existingDomains.has(c.domain));

        console.log(
          `[DomainFinder] ${newCompanies.length} new domains after dedup (${existingDomains.size} duplicates skipped)`
        );

        let successfulLeads = 0;
        const totalToProcess = newCompanies.length;

        for (let i = 0; i < newCompanies.length; i++) {
          const company = newCompanies[i];

          if (await job.isFailed()) {
            const cancelledAt = new Date();
            await prisma.huntSession.update({
              where: { id: huntSessionId },
              data: {
                status: 'CANCELLED',
                completedAt: cancelledAt,
                updatedAt: cancelledAt,
              },
            });

            emitter.emit('hunt-cancelled', { huntSessionId, successfulLeads });
            return;
          }

          try {
            const now = new Date();
            await prisma.lead.create({
              data: {
                userId,
                huntSessionId,
                source: 'HUNTER',
                domain: company.domain,
                businessName: company.organization || null,
                status: 'COLD',
                score: 70,
                technologies: [],
                additionalEmails: [],
                phoneNumbers: [],
                physicalAddresses: [],
                socialProfiles: null,
                companyInfo: {
                  industry: company.industry || null,
                  headcount: company.headcount || null,
                  emailsCount: (company.emails_count as any)?.total || null,
                  location: company.location || null,
                },
                websiteAudit: null,
                contacted: false,
                emailsSentCount: 0,
                createdAt: now,
                updatedAt: now,
              },
            });

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

            await prisma.huntSession.update({
              where: { id: huntSessionId },
              data: {
                progress,
                successfulLeads,
                totalLeads: i + 1,
                updatedAt: new Date(),
              },
            });
          } catch (err) {
            console.error(`[DomainFinder] Error inserting domain ${company.domain}:`, err);
          }
        }

        const completedAt = new Date();
        await prisma.huntSession.update({
          where: { id: huntSessionId },
          data: {
            status: 'COMPLETED',
            progress: 100,
            totalLeads: totalToProcess,
            successfulLeads,
            completedAt,
            updatedAt: completedAt,
          },
        });

        await job.updateProgress(100);

        emitter.emit('hunt-completed', {
          huntSessionId,
          totalLeads: totalToProcess,
          successfulLeads,
          message: `Domain discovery completed! Found ${successfulLeads} new domains`,
        });

        console.log(
          `[DomainFinder] Completed for session ${huntSessionId}: ${successfulLeads}/${totalToProcess} domains inserted`
        );
      } catch (error) {
        console.error(`[DomainFinder] Fatal error for session ${huntSessionId}:`, error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const failedAt = new Date();
        await prisma.huntSession.update({
          where: { id: huntSessionId },
          data: {
            status: 'FAILED',
            error: errorMessage,
            completedAt: failedAt,
            updatedAt: failedAt,
          },
        });

        emitter.emit('hunt-failed', {
          huntSessionId,
          error: errorMessage,
          message: `Domain discovery failed: ${errorMessage}`,
        });

        throw error;
      }
    },
    options: {
      concurrency: 2,
      limiter: {
        max: 5,
        duration: 60000,
      },
    },
  };
}
