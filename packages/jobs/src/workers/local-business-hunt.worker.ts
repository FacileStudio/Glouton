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

          // Emit hunt started event
          if (events) {
            events.emit(userId, 'hunt-started', {
              huntSessionId,
              location,
              category,
              hasWebsite,
              radius,
              maxResults,
              message: `Starting search for ${category} businesses in ${location}`,
            });
          }
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

          // Add a random delay between 0-2 seconds to spread out concurrent job executions
          // This helps prevent rate limiting when multiple jobs run simultaneously
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

          // Emit event for businesses discovered
          if (businessesFound.length > 0 && events) {
            events.emit(userId, 'businesses-discovered', {
              huntSessionId,
              count: businessesFound.length,
              location,
              category,
              sources: [...new Set(businessesFound.map(b => b.source))],
            });
          }
        } catch (error) {
          console.error('[LocalBusinessHunt] Maps search failed:', error);

          // Emit error event to user
          if (events) {
            events.emit(userId, 'hunt-error', {
              huntSessionId,
              error: error instanceof Error ? error.message : 'Unknown error',
              location,
              category,
            });
          }

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
          // Deduplicate domains and names to avoid issues
          const domains = [...new Set(businessesFound.map(b => b.website).filter(Boolean))];
          const names = [...new Set(businessesFound.map(b => b.name).filter(Boolean))];

          // Check for existing leads for this user
          // Format arrays as PostgreSQL array literals
          const pgDomains = `{${domains.join(',')}}`;
          const pgNames = `{${names.map(n => `"${n.replace(/"/g, '\\"')}"`).join(',')}}`;

          // Also generate potential emails to check (matching the logic in insertion)
          const potentialEmails = businessesFound.map(b => {
            const domain = b.website ?
              b.website.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0] : null;

            if (b.email) return b.email;
            if (!domain) return null;

            // Match the email generation logic used in insertion
            const nameSlug = b.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
              .substring(0, 20);

            const businessCity = b.city || b.address?.split(',')[0] || location.split(',')[0];
            const citySlug = businessCity.toLowerCase().replace(/[^a-z0-9]+/g, '').substring(0, 10);

            // Generate possible email variants this business might use
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

          // Deduplicate potential emails before querying
          const uniquePotentialEmails = [...new Set(potentialEmails)];

          const pgEmails = uniquePotentialEmails.length > 0 ?
            `{${uniquePotentialEmails.map(e => `"${e.replace(/"/g, '\\"')}"`).join(',')}}` : '{}';

          const existingLeads = await db`
            SELECT domain, "businessName", email
            FROM "Lead"
            WHERE "userId" = ${userId}
              AND (
                domain = ANY(${pgDomains}::text[])
                OR "businessName" = ANY(${pgNames}::text[])
                OR email = ANY(${pgEmails}::text[])
              )
          `;

          const existingKeys = new Set(
            existingLeads.flatMap((l: any) => [l.domain, l.businessName, l.email].filter(Boolean))
          );

          const newBusinesses = businessesFound.filter(b => {
            const domain = b.website ?
              b.website.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0] : null;

            // Check if domain or name already exists
            if (existingKeys.has(domain) || existingKeys.has(b.name)) {
              return false;
            }

            // Check all potential email variants
            if (b.email && existingKeys.has(b.email)) {
              return false;
            }

            if (domain) {
              // Check the actual email that would be generated
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

              // Generate unique email if not provided
              // Use business name slug for uniqueness when multiple businesses share a domain
              let generatedEmail = business.email;
              if (!generatedEmail && domain) {
                // Create a slug from business name for unique emails
                const nameSlug = business.name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '')
                  .substring(0, 20);

                // Extract city for localization
                const businessCity = business.city || business.address?.split(',')[0] || location.split(',')[0];
                const citySlug = businessCity.toLowerCase().replace(/[^a-z0-9]+/g, '').substring(0, 10);

                // Try different email patterns to avoid duplicates
                // Include more unique identifiers in the email generation
                if (nameSlug && citySlug && nameSlug !== citySlug) {
                  // Combine name and city for uniqueness
                  generatedEmail = `${nameSlug}-${citySlug}@${domain}`;
                } else if (nameSlug && !nameSlug.includes(domain.split('.')[0])) {
                  // Use name-based email if name differs from domain
                  generatedEmail = `${nameSlug}@${domain}`;
                } else if (citySlug && citySlug !== location.split(',')[0].toLowerCase().replace(/[^a-z0-9]+/g, '')) {
                  // Use city-specific email for chain stores
                  generatedEmail = `${citySlug}@${domain}`;
                } else {
                  // Fallback to generic contact email
                  generatedEmail = `contact@${domain}`;
                }
              }

              // For businesses without websites, create a placeholder email
              // This helps track them but won't be used for actual outreach
              if (!generatedEmail && !domain) {
                const nameSlug = business.name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '')
                  .substring(0, 30);

                // Use a unique identifier to prevent duplicates
                const uniqueId = business.id || crypto.randomUUID().substring(0, 8);
                generatedEmail = `${nameSlug}-${uniqueId}@no-website.local`;
              }

              // Format arrays as PostgreSQL array literals
              const phoneNumbers = business.phone ?
                `{${JSON.stringify(business.phone).replace(/[\[\]]/g, '')}}` : '{}';
              const physicalAddresses = business.address ?
                `{${JSON.stringify(business.address).replace(/[\[\]]/g, '')}}` : '{}';

              return {
                id: crypto.randomUUID(),
                userId,
                huntSessionId,
                source: business.source === 'google-maps' ? 'GOOGLE_MAPS' :
                        business.source === 'openstreetmap' ? 'OPENSTREETMAP' : 'GOOGLE_MAPS',
                domain: domain,
                email: generatedEmail,
                businessName: business.name,
                businessType: 'LOCAL_BUSINESS',
                category,
                city: business.city || business.address?.split(',')[0] || location.split(',')[0],
                country: business.country || location.split(',').pop()?.trim(),
                status: 'COLD',
                score: business.hasWebsite ? 60 : 40,
                phoneNumbers,
                physicalAddresses,
                coordinates: business.coordinates,
                hasWebsite: business.hasWebsite,
                socialProfiles: business.socialProfiles || {},
                createdAt: new Date(),
                updatedAt: new Date(),
              };
            });

            // Deduplicate leads by email to prevent PostgreSQL conflict errors
            // When multiple businesses generate the same email, keep only the first one
            const emailMap = new Map<string, any>();
            const deduplicatedLeads = leadsToInsert.filter(lead => {
              if (!lead.email) return true; // Keep leads without emails

              if (emailMap.has(lead.email)) {
                console.log(`[LocalBusinessHunt] Skipping duplicate email: ${lead.email} for ${lead.businessName}`);
                return false;
              }

              emailMap.set(lead.email, lead);
              return true;
            });

            console.log(`[LocalBusinessHunt] Deduplicated ${leadsToInsert.length} leads to ${deduplicatedLeads.length} unique leads`);

            // Use ON CONFLICT to handle any edge cases gracefully
            // Update existing records with new data if there's a conflict
            const insertedLeads = await db`
              INSERT INTO "Lead" ${db(deduplicatedLeads)}
              ON CONFLICT ("userId", email) DO UPDATE SET
                "businessName" = COALESCE(EXCLUDED."businessName", "Lead"."businessName"),
                domain = COALESCE(EXCLUDED.domain, "Lead".domain),
                city = COALESCE(EXCLUDED.city, "Lead".city),
                country = COALESCE(EXCLUDED.country, "Lead".country),
                "phoneNumbers" = CASE
                  WHEN EXCLUDED."phoneNumbers" != '{}' THEN EXCLUDED."phoneNumbers"
                  ELSE "Lead"."phoneNumbers"
                END,
                "physicalAddresses" = CASE
                  WHEN EXCLUDED."physicalAddresses" != '{}' THEN EXCLUDED."physicalAddresses"
                  ELSE "Lead"."physicalAddresses"
                END,
                "hasWebsite" = COALESCE(EXCLUDED."hasWebsite", "Lead"."hasWebsite"),
                coordinates = COALESCE(EXCLUDED.coordinates, "Lead".coordinates),
                "updatedAt" = EXCLUDED."updatedAt"
              RETURNING id, (xmax = 0) AS inserted
            `;

            const actuallyInserted = insertedLeads.filter((l: any) => l.inserted);
            successCount = actuallyInserted.length;
            const updatedCount = insertedLeads.length - successCount;

            if (successCount > 0) {
              console.log(`[LocalBusinessHunt] Inserted ${successCount} new leads`);

              // Emit event for newly inserted leads
              if (events) {
                events.emit(userId, 'leads-created', {
                  huntSessionId,
                  count: successCount,
                  leadIds: actuallyInserted.map(l => l.id),
                  location,
                  category,
                  message: `Found ${successCount} new ${category} businesses in ${location}`,
                });
              }
            }
            if (updatedCount > 0) {
              console.log(`[LocalBusinessHunt] Updated ${updatedCount} existing leads`);

              // Emit event for updated leads
              if (events) {
                events.emit(userId, 'leads-updated', {
                  huntSessionId,
                  count: updatedCount,
                  location,
                  category,
                  message: `Updated ${updatedCount} existing ${category} businesses in ${location}`,
                });
              }
            }
          }
        }

        // 5. Session Progress and Completion Logic
        const newTotalLeads = (currentSession.totalLeads || 0) + successCount;
        const newSuccessfulLeads = (currentSession.successfulLeads || 0) + successCount;

        const filters = currentSession.filters || {};
        const maxResultsFilter = filters.maxResults || 100;

        // Check completion
        const isCompleted = newTotalLeads >= maxResultsFilter;
        const progressPercent = Math.min(100, Math.floor((newTotalLeads / maxResultsFilter) * 100));

        await db`
          UPDATE "HuntSession"
          SET status = ${isCompleted ? 'COMPLETED' : 'PROCESSING'},
              progress = ${progressPercent},
              "totalLeads" = ${newTotalLeads},
              "successfulLeads" = ${newSuccessfulLeads},
              "completedAt" = ${isCompleted ? new Date() : null},
              "updatedAt" = ${new Date()}
          WHERE id = ${huntSessionId}
        `;

        // Emit progress event
        if (events) {
          events.emit(userId, 'hunt-progress', {
            huntSessionId,
            progress: progressPercent,
            totalLeads: newTotalLeads,
            successfulLeads: newSuccessfulLeads,
            location,
            category,
            status: isCompleted ? 'COMPLETED' : 'PROCESSING',
          });
        }

        // Emit completion event if hunt is finished
        if (isCompleted && events) {
          events.emit(userId, 'hunt-completed', {
            huntSessionId,
            totalLeads: newTotalLeads,
            successfulLeads: newSuccessfulLeads,
            location,
            category,
            message: `Hunt completed! Found ${newSuccessfulLeads} ${category} businesses in ${location}`,
          });
        }

        await job.updateProgress(100);
      } catch (error) {
        console.error(`[LocalBusinessHunt] Fatal error:`, error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await db`
          UPDATE "HuntSession"
          SET status = 'FAILED',
              error = ${errorMessage},
              "completedAt" = ${new Date()},
              "updatedAt" = ${new Date()}
          WHERE id = ${huntSessionId}
        `;

        // Emit hunt failed event
        if (events) {
          events.emit(userId, 'hunt-failed', {
            huntSessionId,
            error: errorMessage,
            location,
            category,
            message: `Hunt failed: ${errorMessage}`,
          });
        }

        throw error;
      }
    },
    options: {
      concurrency: 2, // Reduced from 5 to prevent rate limiting
      limiter: {
        max: 10,
        duration: 60000, // Max 10 jobs per minute
      },
    },
  };
}
