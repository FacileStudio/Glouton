import type { JobDefinition } from '../types';
import { Job as BullJob } from 'bullmq';
import { MapsOrchestrator } from '@repo/maps';
import type { LocalBusiness } from '@repo/maps';
import type { EventEmitter } from './index';
import { JobEventEmitter } from '../lib/job-event-emitter';
import { prisma } from '@repo/database';
import { Prisma } from '@prisma/client';

export interface LocalBusinessHuntData {
  huntSessionId: string;
  userId: string;
  location: string;
  category: string;
  hasWebsite?: boolean;
  radius?: number;
  maxResults?: number;
  googleMapsApiKey?: string;
}

export function createLocalBusinessHuntWorker(events: EventEmitter): JobDefinition<LocalBusinessHuntData, void> {
  return {
    name: 'local-business-hunt',
    processor: async (job: BullJob<LocalBusinessHuntData>) => {
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
      const emitter = new JobEventEmitter(events, userId);

      const checkCancellation = async () => {
        if (await job.isFailed() || await job.isCompleted()) {
          return true;
        }
        return false;
      };

      try {
        console.log(`[LocalBusinessHunt] Starting hunt for ${category} in ${location}`);

        const currentSession = await prisma.huntSession.findUnique({
          where: { id: huntSessionId },
          select: { status: true, totalLeads: true, successfulLeads: true, filters: true },
        });

        if (!currentSession) {
          console.warn(`[LocalBusinessHunt] Session ${huntSessionId} not found, skipping job`);
          return;
        }

        if (currentSession.status === 'PENDING') {
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
            huntType: 'LOCAL_BUSINESS',
            location,
            category,
            hasWebsite,
            radius,
            message: `Starting search for ${category} businesses in ${location}`,
          });

          emitter.emit('hunt-processing', {
            huntSessionId,
            startedAt: startedAt.toISOString(),
          });
        }

        await job.updateProgress(10);

        if (await checkCancellation()) {
          console.log(`[LocalBusinessHunt] Hunt cancelled for session ${huntSessionId} before search`);

          const cancelledAt = new Date();
          await prisma.huntSession.update({
            where: { id: huntSessionId },
            data: {
              status: 'CANCELLED',
              completedAt: cancelledAt,
              updatedAt: cancelledAt,
            },
          });

          emitter.emit('hunt-cancelled', {
            huntSessionId,
            totalLeads: currentSession.totalLeads || 0,
            successfulLeads: currentSession.successfulLeads || 0,
          });

          return { cancelled: true };
        }

        const mapsOrchestrator = new MapsOrchestrator({
          googleMapsApiKey,
          useGoogleMaps: !!googleMapsApiKey,
          useOpenStreetMap: true,
        });

        let businessesFound: LocalBusiness[] = [];
        let successCount = 0;

        try {
          console.log(`[LocalBusinessHunt] Searching for ${category} businesses in ${location}`);

          const randomDelay = Math.floor(Math.random() * 2000);
          await new Promise(resolve => setTimeout(resolve, randomDelay));

          businessesFound = await mapsOrchestrator.search({
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
              sources: [...new Set(businessesFound.map(b => b.source))],
            });
          }
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

        if (await checkCancellation()) {
          console.log(`[LocalBusinessHunt] Hunt cancelled for session ${huntSessionId} after search`);

          const cancelledAt = new Date();
          await prisma.huntSession.update({
            where: { id: huntSessionId },
            data: {
              status: 'CANCELLED',
              completedAt: cancelledAt,
              updatedAt: cancelledAt,
            },
          });

          emitter.emit('hunt-cancelled', {
            huntSessionId,
            totalLeads: currentSession.totalLeads || 0,
            successfulLeads: currentSession.successfulLeads || 0,
          });

          return { cancelled: true };
        }

        await job.updateProgress(50);


        if (businessesFound.length > 0) {
          const domains = [...new Set(businessesFound.map(b => b.website).filter(Boolean))];
          const names = [...new Set(businessesFound.map(b => b.name).filter(Boolean))];

          const potentialEmails = businessesFound.map(b => {
            const domain = b.website ?
              b.website.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0] : null;

            if (b.email) return b.email;
            if (!domain) return null;

            const nameSlug = b.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
              .substring(0, 20);

            const businessCity = b.city || b.address?.split(',')[0] || location.split(',')[0];
            const citySlug = businessCity.toLowerCase().replace(/[^a-z0-9]+/g, '').substring(0, 10);

            const variants = [`contact@${domain}`];

            if (nameSlug && citySlug && nameSlug !== citySlug) {
              variants.push(`${nameSlug}-${citySlug}@${domain}`);
            }

            if (nameSlug && !nameSlug.includes(domain.split('.')[0])) {
              variants.push(`${nameSlug}@${domain}`);
            }

            if (citySlug && citySlug !== location.split(',')[0].toLowerCase().replace(/[^a-z0-9]+/g, '')) {
              variants.push(`${citySlug}@${domain}`);
            }

            return variants;
          }).flat().filter(Boolean);

          const uniquePotentialEmails = [...new Set(potentialEmails)];

          const existingLeads = await prisma.lead.findMany({
            where: {
              userId,
              OR: [
                { domain: { in: domains } },
                { businessName: { in: names } },
                ...(uniquePotentialEmails.length > 0 ? [{ email: { in: uniquePotentialEmails } }] : []),
              ],
            },
            select: { domain: true, businessName: true, email: true },
          });

          const existingKeys = new Set(
            existingLeads.flatMap((l: any) => [l.domain, l.businessName, l.email].filter(Boolean))
          );

          const newBusinesses = businessesFound.filter(b => {
            const domain = b.website ?
              b.website.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0] : null;

            if (existingKeys.has(domain) || existingKeys.has(b.name)) {
              return false;
            }

            if (b.email && existingKeys.has(b.email)) {
              return false;
            }

            if (domain) {
              const nameSlug = b.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
                .substring(0, 20);

              const businessCity = b.city || b.address?.split(',')[0] || location.split(',')[0];
              const citySlug = businessCity.toLowerCase().replace(/[^a-z0-9]+/g, '').substring(0, 10);

              let generatedEmail;
              if (nameSlug && citySlug && nameSlug !== citySlug) {
                generatedEmail = `${nameSlug}-${citySlug}@${domain}`;
              } else if (nameSlug && !nameSlug.includes(domain.split('.')[0])) {
                generatedEmail = `${nameSlug}@${domain}`;
              } else if (citySlug && citySlug !== location.split(',')[0].toLowerCase().replace(/[^a-z0-9]+/g, '')) {
                generatedEmail = `${citySlug}@${domain}`;
              } else {
                generatedEmail = `contact@${domain}`;
              }

              if (existingKeys.has(generatedEmail)) {
                return false;
              }
            }

            return true;
          });

          if (await checkCancellation()) {
            console.log(`[LocalBusinessHunt] Hunt cancelled for session ${huntSessionId} before inserting leads`);

            const cancelledAt = new Date();
            await prisma.huntSession.update({
              where: { id: huntSessionId },
              data: {
                status: 'CANCELLED',
                completedAt: cancelledAt,
                updatedAt: cancelledAt,
              },
            });

            emitter.emit('hunt-cancelled', {
              huntSessionId,
              totalLeads: currentSession.totalLeads || 0,
              successfulLeads: currentSession.successfulLeads || 0,
            });

            return { cancelled: true };
          }

          const validBusinesses = newBusinesses.filter(b =>
            b.coordinates && (b.coordinates.lat !== 0 || b.coordinates.lng !== 0)
          );

          if (validBusinesses.length > 0) {
            const leadsToInsert = validBusinesses.map(business => {
              const domain = business.website ?
                business.website.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0] : null;

              let generatedEmail = business.email;
              if (!generatedEmail && domain) {
                const nameSlug = business.name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '')
                  .substring(0, 20);

                const businessCity = business.city || business.address?.split(',')[0] || location.split(',')[0];
                const citySlug = businessCity.toLowerCase().replace(/[^a-z0-9]+/g, '').substring(0, 10);

                if (nameSlug && citySlug && nameSlug !== citySlug) {
                  generatedEmail = `${nameSlug}-${citySlug}@${domain}`;
                } else if (nameSlug && !nameSlug.includes(domain.split('.')[0])) {
                  generatedEmail = `${nameSlug}@${domain}`;
                } else if (citySlug && citySlug !== location.split(',')[0].toLowerCase().replace(/[^a-z0-9]+/g, '')) {
                  generatedEmail = `${citySlug}@${domain}`;
                } else {
                  generatedEmail = `contact@${domain}`;
                }
              }

              const phoneNumbers = business.phone ? [business.phone] : [];
              const physicalAddresses = business.address ? [business.address] : [];

              const cityName = business.city || location.split(',')[0].trim();
              const countryCode = (business.country || location.split(',').pop()?.trim() || '').toUpperCase();

              return {
                userId,
                huntSessionId,
                source: business.source === 'google-maps' ? 'GOOGLE_MAPS' :
                        business.source === 'openstreetmap' ? 'OPENSTREETMAP' : 'GOOGLE_MAPS',
                domain: domain,
                email: generatedEmail,
                businessName: business.name,
                businessType: 'LOCAL_BUSINESS',
                category,
                city: cityName,
                country: countryCode || null,
                status: 'COLD',
                score: business.hasWebsite ? 60 : 40,
                phoneNumbers,
                physicalAddresses,
                coordinates: business.coordinates as Prisma.InputJsonValue,
                hasWebsite: business.hasWebsite,
                socialProfiles: (business.socialProfiles || {}) as Prisma.InputJsonValue,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
            });

            const emailMap = new Map<string, any>();
            const deduplicatedLeads = leadsToInsert.filter(lead => {
              if (!lead.email) return true;

              if (emailMap.has(lead.email)) {
                return false;
              }

              emailMap.set(lead.email, lead);
              return true;
            });

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
              successCount = totalInserted;

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
          }
        }

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

        await job.updateProgress(100);
      } catch (error) {
        console.error(`[LocalBusinessHunt] Fatal error:`, error);

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
          location,
          category,
          message: `Hunt failed: ${errorMessage}`,
        });

        throw error;
      }
    },
    options: {
      concurrency: 1,
      limiter: {
        max: 5,
        duration: 60000,
      },
    },
  };
}
