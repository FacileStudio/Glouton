import type { JobDefinition } from '../types';
import type { SQL } from 'bun';
import { Job as BullJob } from 'bullmq';
import { MapsOrchestrator } from '@repo/maps';
import type { LocalBusiness } from '@repo/maps';
import type { EventEmitter } from './index';

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

export function createLocalBusinessHuntWorker(db: SQL, events: EventEmitter): JobDefinition<LocalBusinessHuntData, void> {
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

      // Set up cancellation checking
      const checkCancellation = async () => {
        if (await job.isFailed() || await job.isCompleted()) {
          return true;
        }
        return false;
      };

      try {
        console.log(`[LocalBusinessHunt] Starting hunt for ${category} in ${location}`);

        // 1. Get current session state
        const [currentSession] = await db`
          SELECT status, "totalLeads", "successfulLeads", filters
          FROM "HuntSession"
          WHERE id = ${huntSessionId}
        `;

        if (!currentSession) throw new Error(`Hunt session ${huntSessionId} not found`);

        if (currentSession.status === 'PENDING') {
          await db`
            UPDATE "HuntSession"
            SET status = 'PROCESSING',
                "startedAt" = ${new Date()},
                "updatedAt" = ${new Date()}
            WHERE id = ${huntSessionId}
          `;
        }

        await job.updateProgress(10);

        // Check for cancellation before starting expensive operations
        if (await checkCancellation()) {
          console.log(`[LocalBusinessHunt] Hunt cancelled for session ${huntSessionId} before search`);

          await db`
            UPDATE "HuntSession"
            SET status = 'CANCELLED',
                "completedAt" = ${new Date()},
                "updatedAt" = ${new Date()}
            WHERE id = ${huntSessionId}
          `;

          if (events) {
            events.emit(userId, 'hunt-cancelled', {
              huntSessionId,
              totalLeads: currentSession.totalLeads || 0,
              successfulLeads: currentSession.successfulLeads || 0
            });
          }

          return { cancelled: true };
        }

        // 2. Initialize Maps Orchestrator and search for businesses
        const mapsOrchestrator = new MapsOrchestrator({
          googleMapsApiKey,
          useGoogleMaps: !!googleMapsApiKey,
          useOpenStreetMap: true,
        });

        let businessesFound: LocalBusiness[] = [];
        let successCount = 0;

        try {
          console.log(`[LocalBusinessHunt] Searching for ${category} businesses in ${location}`);

          businessesFound = await mapsOrchestrator.search({
            location,
            category,
            radius,
            maxResults,
            hasWebsite,
          });

          console.log(`[LocalBusinessHunt] Found ${businessesFound.length} businesses from map services`);
        } catch (error) {
          console.error('[LocalBusinessHunt] Maps search failed:', error);
          throw new Error(`Failed to search for businesses: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Check for cancellation after search completes
        if (await checkCancellation()) {
          console.log(`[LocalBusinessHunt] Hunt cancelled for session ${huntSessionId} after search`);

          await db`
            UPDATE "HuntSession"
            SET status = 'CANCELLED',
                "completedAt" = ${new Date()},
                "updatedAt" = ${new Date()}
            WHERE id = ${huntSessionId}
          `;

          if (events) {
            events.emit(userId, 'hunt-cancelled', {
              huntSessionId,
              totalLeads: currentSession.totalLeads || 0,
              successfulLeads: currentSession.successfulLeads || 0
            });
          }

          return { cancelled: true };
        }

        await job.updateProgress(50);

        // 3. Filter out businesses already processed (deduplication handled by MapsOrchestrator)

        if (businessesFound.length > 0) {
          const domains = businessesFound.map(b => b.website).filter(Boolean);
          const names = businessesFound.map(b => b.name).filter(Boolean);

          // Check for existing leads for this user
          // Format arrays as PostgreSQL array literals
          const pgDomains = `{${domains.join(',')}}`;
          const pgNames = `{${names.map(n => `"${n.replace(/"/g, '\\"')}"`).join(',')}}`;

          const existingLeads = await db`
            SELECT domain, "businessName"
            FROM "Lead"
            WHERE "userId" = ${userId}
              AND (
                domain = ANY(${pgDomains}::text[])
                OR "businessName" = ANY(${pgNames}::text[])
              )
          `;

          const existingKeys = new Set(
            existingLeads.map((l: any) => l.domain || l.businessName)
          );

          const newBusinesses = businessesFound.filter(b =>
            !existingKeys.has(b.website || b.name)
          );

          // Check for cancellation before inserting leads
          if (await checkCancellation()) {
            console.log(`[LocalBusinessHunt] Hunt cancelled for session ${huntSessionId} before inserting leads`);

            await db`
              UPDATE "HuntSession"
              SET status = 'CANCELLED',
                  "completedAt" = ${new Date()},
                  "updatedAt" = ${new Date()}
              WHERE id = ${huntSessionId}
            `;

            if ((global as any).events) {
              (global as any).events.emit(userId, 'hunt-cancelled', {
                huntSessionId,
                totalLeads: currentSession.totalLeads || 0,
                successfulLeads: currentSession.successfulLeads || 0
              });
            }

            return { cancelled: true };
          }

          // 4. Batch Insert Leads
          if (newBusinesses.length > 0) {
            const leadsToInsert = newBusinesses.map(business => {
              // Extract domain from website URL if available
              const domain = business.website ?
                business.website.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0] : null;

              return {
                id: crypto.randomUUID(),
                userId,
                huntSessionId,
                source: business.source === 'google-maps' ? 'GOOGLE_MAPS' :
                        business.source === 'openstreetmap' ? 'OPENSTREETMAP' : 'GOOGLE_MAPS',
                domain: domain,
                email: business.email || (domain ? `contact@${domain}` : null),
                businessName: business.name,
                company: business.name,
                businessType: 'LOCAL_BUSINESS',
                category,
                city: business.city || business.address?.split(',')[0] || location.split(',')[0],
                country: business.country || location.split(',').pop()?.trim(),
                status: 'COLD',
                score: business.hasWebsite ? 60 : 40,
                phoneNumbers: business.phone ? [business.phone] : [],
                physicalAddresses: business.address ? [business.address] : [],
                coordinates: business.coordinates,
                hasWebsite: business.hasWebsite,
                socialProfiles: business.socialProfiles || {},
                createdAt: new Date(),
                updatedAt: new Date(),
              };
            });

            const insertedLeads = await db`
              INSERT INTO "Lead" ${db(leadsToInsert)}
              RETURNING id
            `;

            successCount = insertedLeads.length;
            console.log(`[LocalBusinessHunt] Inserted ${successCount} leads`);
          }
        }

        // 5. Session Progress and Completion Logic
        const newTotalLeads = (currentSession.totalLeads || 0) + successCount;
        const newSuccessfulLeads = (currentSession.successfulLeads || 0) + successCount;

        const filters = currentSession.filters || {};
        const maxResultsFilter = filters.maxResults || 100;

        // Check completion
        const isCompleted = newTotalLeads >= maxResultsFilter;

        await db`
          UPDATE "HuntSession"
          SET status = ${isCompleted ? 'COMPLETED' : 'PROCESSING'},
              progress = ${Math.min(100, Math.floor((newTotalLeads / maxResultsFilter) * 100))},
              "totalLeads" = ${newTotalLeads},
              "successfulLeads" = ${newSuccessfulLeads},
              "completedAt" = ${isCompleted ? new Date() : null},
              "updatedAt" = ${new Date()}
          WHERE id = ${huntSessionId}
        `;

        await job.updateProgress(100);
      } catch (error) {
        console.error(`[LocalBusinessHunt] Fatal error:`, error);
        await db`
          UPDATE "HuntSession"
          SET status = 'FAILED',
              error = ${error instanceof Error ? error.message : 'Unknown error'},
              "completedAt" = ${new Date()}
          WHERE id = ${huntSessionId}
        `;
        throw error;
      }
    },
    options: {
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 60000,
      },
    },
  };
}
