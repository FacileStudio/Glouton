import type { JobDefinition } from '../types';
import type { SQL } from 'bun';
import { Job as BullJob } from 'bullmq';

export interface LeadExtractionData {
  huntSessionId: string;
  userId: string;
  sources: string[];
  targetUrl?: string;
  companyName?: string;
  filters?: any;
}

export function createLeadExtractionWorker(db: SQL): JobDefinition<LeadExtractionData, void> {
  return {
    name: 'lead-extraction',
    processor: async (job: BullJob<LeadExtractionData>) => {
      const { huntSessionId, userId, sources, targetUrl, companyName, filters } = job.data;

    try {
      console.log(`[LeadExtraction] Starting lead extraction for session ${huntSessionId}`);

      // Update hunt session to PROCESSING
      await db`
        UPDATE "HuntSession"
        SET status = 'PROCESSING',
            "startedAt" = ${new Date()},
            "updatedAt" = ${new Date()}
        WHERE id = ${huntSessionId}
      `;

      await job.updateProgress(5);

      // Initialize source stats
      const sourceStats: Record<string, any> = {};
      let totalLeads = 0;
      let successfulLeads = 0;
      let failedLeads = 0;

      // Process each source
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        sourceStats[source] = { leads: 0, errors: 0, rateLimited: false };

        console.log(`[LeadExtraction] Processing source: ${source}`);

        try {
          // Get user's API key for the source
          const [user] = await db`
            SELECT "hunterApiKey", "apolloApiKey", "snovApiKey", "hasdataApiKey", "contactoutApiKey"
            FROM "User"
            WHERE id = ${userId}
          ` as any[];

          if (!user) {
            throw new Error(`User ${userId} not found`);
          }

          const apiKeyMap: Record<string, string | null> = {
            HUNTER: user.hunterApiKey,
            APOLLO: user.apolloApiKey,
            SNOV: user.snovApiKey,
            HASDATA: user.hasdataApiKey,
            CONTACTOUT: user.contactoutApiKey,
          };

          const apiKey = apiKeyMap[source];
          if (!apiKey) {
            console.warn(`[LeadExtraction] No API key configured for ${source}`);
            sourceStats[source].errors++;
            continue;
          }

          // Extract leads based on source
          let extractedLeads: any[] = [];

          switch (source) {
            case 'HUNTER':
              // Hunter.io implementation placeholder
              console.log(`[LeadExtraction] Using Hunter.io API with domain: ${targetUrl}`);
              // extractedLeads = await extractFromHunter(apiKey, targetUrl, filters);
              break;

            case 'APOLLO':
              // Apollo.io implementation placeholder
              console.log(`[LeadExtraction] Using Apollo.io API`);
              // extractedLeads = await extractFromApollo(apiKey, targetUrl, companyName, filters);
              break;

            case 'SNOV':
              // Snov.io implementation placeholder
              console.log(`[LeadExtraction] Using Snov.io API`);
              // extractedLeads = await extractFromSnov(apiKey, targetUrl, filters);
              break;

            case 'HASDATA':
              // HasData implementation placeholder
              console.log(`[LeadExtraction] Using HasData API`);
              // extractedLeads = await extractFromHasData(apiKey, targetUrl, filters);
              break;

            case 'CONTACTOUT':
              // ContactOut implementation placeholder
              console.log(`[LeadExtraction] Using ContactOut API`);
              // extractedLeads = await extractFromContactOut(apiKey, targetUrl, filters);
              break;

            default:
              console.warn(`[LeadExtraction] Unknown source: ${source}`);
              sourceStats[source].errors++;
              continue;
          }

          // For now, let's simulate some lead extraction
          extractedLeads = generateMockLeads(source, targetUrl || 'example.com', 5);

          // Check for duplicates
          // Format arrays as PostgreSQL array literals
          const emails = extractedLeads.map(l => l.email).filter(e => e);
          const domains = extractedLeads.map(l => l.domain).filter(d => d);
          const firstNames = extractedLeads.map(l => l.firstName).filter(f => f);
          const lastNames = extractedLeads.map(l => l.lastName).filter(l => l);

          const pgEmails = emails.length > 0 ? `{${emails.map(e => `"${e.replace(/"/g, '\\"')}"`).join(',')}}` : '{}';
          const pgDomains = domains.length > 0 ? `{${domains.join(',')}}` : '{}';
          const pgFirstNames = firstNames.length > 0 ? `{${firstNames.map(n => `"${n.replace(/"/g, '\\"')}"`).join(',')}}` : '{}';
          const pgLastNames = lastNames.length > 0 ? `{${lastNames.map(n => `"${n.replace(/"/g, '\\"')}"`).join(',')}}` : '{}';

          const existingLeads = await db`
            SELECT email, domain, "firstName", "lastName"
            FROM "Lead"
            WHERE "userId" = ${userId}
              AND (
                email = ANY(${pgEmails}::text[])
                OR (
                  domain = ANY(${pgDomains}::text[])
                  AND "firstName" = ANY(${pgFirstNames}::text[])
                  AND "lastName" = ANY(${pgLastNames}::text[])
                )
              )
          ` as any[];

          const existingKeys = new Set(
            existingLeads.map((l: any) =>
              l.email || `${l.domain}:${l.firstName}:${l.lastName}`
            )
          );

          const newLeads = extractedLeads.filter(lead =>
            !existingKeys.has(lead.email || `${lead.domain}:${lead.firstName}:${lead.lastName}`)
          );

          // Insert new leads
          if (newLeads.length > 0) {
            const leadsToInsert = newLeads.map(lead => ({
              userId,
              huntSessionId,
              source,
              domain: lead.domain,
              email: lead.email,
              firstName: lead.firstName,
              lastName: lead.lastName,
              position: lead.jobTitle,
              businessName: lead.company,
              city: lead.city,
              country: lead.country,
              status: 'COLD',
              score: 50,
              technologies: [],
              additionalEmails: [],
              phoneNumbers: lead.phoneNumbers || [],
              physicalAddresses: [],
              socialProfiles: null,
              companyInfo: null,
              websiteAudit: null,
              contacted: false,
              emailsSentCount: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));

            const insertedLeads = await db`
              INSERT INTO "Lead" ${db(leadsToInsert)}
              RETURNING id
            `;

            sourceStats[source].leads = insertedLeads.length;
            successfulLeads += insertedLeads.length;
            console.log(`[LeadExtraction] Inserted ${insertedLeads.length} leads from ${source}`);
          }

          totalLeads += extractedLeads.length;

        } catch (error) {
          console.error(`[LeadExtraction] Error processing ${source}:`, error);
          sourceStats[source].errors++;
          failedLeads += sourceStats[source].leads || 0;
        }

        // Update progress
        const progress = Math.floor(((i + 1) / sources.length) * 80) + 10;
        await job.updateProgress(progress);
      }

      // Website audit phase (if leads were found)
      if (successfulLeads > 0) {
        console.log(`[LeadExtraction] Starting website audit phase for ${successfulLeads} leads`);
        await job.updateProgress(90);

        // This would trigger website scraping and enrichment
        // For now, we'll just update the progress

        await job.updateProgress(95);
      }

      // Update hunt session with final stats
      await db`
        UPDATE "HuntSession"
        SET status = 'COMPLETED',
            progress = 100,
            "totalLeads" = ${totalLeads},
            "successfulLeads" = ${successfulLeads},
            "failedLeads" = ${failedLeads},
            "sourceStats" = ${JSON.stringify(sourceStats)}::jsonb,
            "completedAt" = ${new Date()},
            "updatedAt" = ${new Date()}
        WHERE id = ${huntSessionId}
      `;

      await job.updateProgress(100);
      console.log(`[LeadExtraction] Completed extraction for session ${huntSessionId}`);
      console.log(`[LeadExtraction] Total: ${totalLeads}, Successful: ${successfulLeads}, Failed: ${failedLeads}`);

    } catch (error) {
      console.error(`[LeadExtraction] Fatal error for session ${huntSessionId}:`, error);

      // Update hunt session to FAILED
      await db`
        UPDATE "HuntSession"
        SET status = 'FAILED',
            error = ${error instanceof Error ? error.message : 'Unknown error'},
            "completedAt" = ${new Date()},
            "updatedAt" = ${new Date()}
        WHERE id = ${huntSessionId}
      `;

      throw error;
    }
    },
    options: {
      concurrency: 3,
      limiter: {
        max: 5,
        duration: 60000, // 5 jobs per minute
      },
    },
  };
}

// Mock function to generate sample leads for testing
function generateMockLeads(source: string, domain: string, count: number) {
  const leads = [];
  const firstNames = ['John', 'Jane', 'Bob', 'Alice', 'Charlie'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Jones', 'Brown'];
  const positions = ['CEO', 'CTO', 'VP Sales', 'Marketing Director', 'Product Manager'];

  for (let i = 0; i < count; i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[i % lastNames.length];
    leads.push({
      source,
      domain: domain.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`,
      firstName,
      lastName,
      jobTitle: positions[i % positions.length],
      company: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
      city: 'San Francisco',
      country: 'United States',
      phoneNumbers: [`+1 555-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`],
    });
  }

  return leads;
}