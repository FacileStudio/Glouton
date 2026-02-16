import type { JobDefinition } from '../types';
import type { SQL } from 'bun';
import { Job as BullJob } from 'bullmq';

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

export function createLocalBusinessHuntWorker(db: SQL): JobDefinition<LocalBusinessHuntData, void> {
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

        // 2. Data Sourcing (Google Maps / OSM Fallback)
        let businessesFound: any[] = [];
        let successCount = 0;

        if (googleMapsApiKey) {
          // Placeholder for real Google Places logic
          businessesFound = generateMockLocalBusinesses(category, location, Math.min(10, maxResults));
        }

        if (businessesFound.length < maxResults) {
          const additional = generateMockLocalBusinesses(
            category,
            location,
            Math.min(10, maxResults - businessesFound.length),
            'OSM'
          );
          businessesFound = [...businessesFound, ...additional];
        }

        await job.updateProgress(50);

        // 3. Filter and Deduplicate
        if (hasWebsite !== undefined) {
          businessesFound = businessesFound.filter(b => b.hasWebsite === hasWebsite);
        }

        if (businessesFound.length > 0) {
          const domains = businessesFound.map(b => b.domain).filter(Boolean);
          const names = businessesFound.map(b => b.businessName).filter(Boolean);

          // Check for existing leads for this user
          const existingLeads = await db`
            SELECT domain, "businessName"
            FROM "Lead"
            WHERE "userId" = ${userId}
              AND (
                domain = ANY(${domains})
                OR "businessName" = ANY(${names})
              )
          `;

          const existingKeys = new Set(
            existingLeads.map((l: any) => l.domain || l.businessName)
          );

          const newBusinesses = businessesFound.filter(b =>
            !existingKeys.has(b.domain || b.businessName)
          );

          // 4. Batch Insert Leads
          if (newBusinesses.length > 0) {
            const leadsToInsert = newBusinesses.map(business => ({
              id: crypto.randomUUID(), // Use JS generation or gen_random_uuid() in SQL
              userId,
              huntSessionId,
              source: business.source || 'GOOGLE_MAPS',
              domain: business.domain,
              email: business.email || (business.domain ? `contact@${business.domain}` : null), // Corrected to singular "email"
              businessName: business.businessName,
              company: business.businessName,
              businessType: 'LOCAL_BUSINESS',
              category,
              city: business.city || location.split(',')[0],
              country: business.country || location.split(',').pop()?.trim(),
              status: 'COLD',
              score: business.hasWebsite ? 60 : 40,
              phoneNumbers: business.phoneNumbers || [],
              physicalAddresses: business.addresses || [],
              coordinates: business.coordinates,
              hasWebsite: business.hasWebsite,
              socialProfiles: business.socialProfiles,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));

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

// Mock generator for testing
function generateMockLocalBusinesses(category: string, location: string, count: number, source = 'GOOGLE_MAPS') {
  const businesses = [];
  for (let i = 0; i < count; i++) {
    const id = Math.floor(Math.random() * 1000);
    const name = `${category.charAt(0).toUpperCase() + category.slice(1)} ${location} #${id}`;
    const hasWeb = Math.random() > 0.3;
    const domain = hasWeb ? `${name.toLowerCase().replace(/\s+/g, '-')}.com` : null;

    businesses.push({
      source,
      businessName: name,
      domain,
      email: domain ? `info@${domain}` : null,
      hasWebsite: hasWeb,
      city: location.split(',')[0],
      phoneNumbers: [`+1 555-010${i}`],
      addresses: [`${100 + i} Main St, ${location}`],
      coordinates: { lat: 40.7128, lng: -74.0060 },
      socialProfiles: { facebook: domain ? `fb.com/${domain}` : null }
    });
  }
  return businesses;
}
