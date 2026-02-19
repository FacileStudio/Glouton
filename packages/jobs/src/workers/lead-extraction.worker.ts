import type { JobDefinition } from '../types';
import type { SQL } from 'bun';
import { Job as BullJob } from 'bullmq';
import {
  LeadSourceFactory,
  type LeadData,
  type LeadSourceFilters,
} from '@repo/lead-sources';
import type { EventEmitter } from './index';
import { JobEventEmitter } from '../lib/job-event-emitter';

export interface LeadExtractionData {
  huntSessionId: string;
  userId: string;
  sources: string[];
  companyName?: string;
  filters?: any;
}

function inferCategory(industry: string | null | undefined): string | null {
  if (!industry) return null;
  const i = industry.toLowerCase();
  if (i.includes('seo') || i.includes('search engine optimization')) return 'seo-agency';
  if (i.includes('web design') || i.includes('graphic design') || i.includes('ui/ux') || i.includes('ux design')) return 'design-agency';
  if (i.includes('web development') || i.includes('web dev') || i.includes('software') || i.includes('computer') || i.includes('it services') || i.includes('information technology') || i.includes('internet')) return 'web-dev-agency';
  if (i.includes('marketing') || i.includes('advertising') || i.includes('digital marketing') || i.includes('content marketing')) return 'marketing-agency';
  if (i.includes('design')) return 'design-agency';
  if (i.includes('health') || i.includes('medical') || i.includes('pharma')) return 'healthcare';
  if (i.includes('education') || i.includes('e-learning') || i.includes('training')) return 'education';
  if (i.includes('finance') || i.includes('banking') || i.includes('insurance') || i.includes('investment')) return 'finance';
  if (i.includes('real estate') || i.includes('property')) return 'real-estate';
  if (i.includes('retail') || i.includes('e-commerce') || i.includes('ecommerce')) return 'retail';
  if (i.includes('travel') || i.includes('hospitality') || i.includes('tourism')) return 'travel';
  if (i.includes('automotive') || i.includes('vehicle')) return 'automotive';
  if (i.includes('entertainment') || i.includes('media') || i.includes('gaming')) return 'entertainment';
  if (i.includes('food') || i.includes('restaurant') || i.includes('beverage')) return 'restaurant';
  if (i.includes('fitness') || i.includes('sport') || i.includes('wellness')) return 'fitness';
  return 'professional-services';
}

export function createLeadExtractionWorker(
  db: SQL,
  events: EventEmitter
): JobDefinition<LeadExtractionData, void> {
  return {
    name: 'lead-extraction',
    processor: async (job: BullJob<LeadExtractionData>) => {
      const { huntSessionId, userId, sources, companyName, filters } = job.data;
      const emitter = new JobEventEmitter(events, userId);

      try {
        console.log(`[LeadExtraction] Starting lead extraction for session ${huntSessionId}`);

        emitter.emit('extraction-started', {
          huntSessionId,
          sources,
          companyName,
          message: 'Starting lead extraction...',
        });

        await db`
          UPDATE "HuntSession"
          SET status = 'PROCESSING',
              "startedAt" = ${new Date()},
              "updatedAt" = ${new Date()}
          WHERE id = ${huntSessionId}
        `;

        await job.updateProgress(5);

        const [user] = (await db`
          SELECT "hunterApiKey" FROM "User" WHERE id = ${userId}
        `) as any[];

        if (!user) throw new Error(`User ${userId} not found`);

        const apiKeys = { hunterApiKey: user.hunterApiKey };
        const hasApiKey: Record<string, boolean> = {
          HUNTER: !!apiKeys.hunterApiKey,
          MANUAL: true,
        };

        const sourceStats: Record<string, any> = {};
        let totalLeads = 0;
        let successfulLeads = 0;
        let failedLeads = 0;

        for (let i = 0; i < sources.length; i++) {
          const source = sources[i];
          sourceStats[source] = { leads: 0, errors: 0, rateLimited: false };

          console.log(`[LeadExtraction] Processing source: ${source}`);

          try {
            if (await job.isFailed()) {
              emitter.emit('extraction-cancelled', {
                huntSessionId,
                message: 'Extraction cancelled by user',
              });
              return;
            }

            if (!hasApiKey[source]) {
              console.warn(`[LeadExtraction] No API key configured for ${source}`);
              sourceStats[source].errors++;

              emitter.emit('extraction-error', {
                huntSessionId,
                source,
                error: `No API credentials configured for ${source}`,
                message: `Skipping ${source} - API credentials not configured`,
              });
              continue;
            }

            let extractedLeads: LeadData[] = [];

            try {
              emitter.emit('source-started', {
                huntSessionId,
                source,
                message: `Extracting leads from ${source}...`,
              });

              const provider = LeadSourceFactory.create(source as any, apiKeys);

              const searchFilters: LeadSourceFilters = {
                limit: filters?.limit || 100,
                offset: filters?.offset || 0,
                type: filters?.type || 'personal',
                seniority: filters?.seniority,
                department: filters?.department,
                jobTitles: filters?.jobTitles,
                location: filters?.location,
                verificationStatus: filters?.verificationStatus,
              };

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
              continue;
            }

            const mappedLeads = extractedLeads.map((lead: LeadData) => ({
              domain: lead.domain || 'unknown',
              email: lead.email || null,
              firstName: lead.firstName || null,
              lastName: lead.lastName || null,
              jobTitle: lead.position || null,
              company:
                companyName ||
                lead.metadata?.organization ||
                lead.metadata?.company ||
                null,
              city: lead.metadata?.location?.city || lead.metadata?.city || null,
              country: lead.metadata?.location?.country || lead.metadata?.country || null,
              phoneNumbers: lead.metadata?.phoneNumbers || [],
              department: lead.department || null,
              confidence: lead.confidence,
              industry: lead.metadata?.industry || null,
            }));

            const existingDomains = new Set<string>();
            const existingEmails = new Set<string>();

            const domainOnlyLeads = mappedLeads.filter((l) => !l.email && !!l.domain);
            const emailLeads = mappedLeads.filter((l) => !!l.email);

            if (domainOnlyLeads.length > 0) {
              const pgDomains = `{${domainOnlyLeads
                .map((l) => `"${l.domain.replace(/"/g, '\\"')}"`)
                .join(',')}}`;
              const existing = (await db`
                SELECT domain FROM "Lead"
                WHERE "userId" = ${userId}
                  AND email IS NULL
                  AND domain = ANY(${pgDomains}::text[])
              `) as any[];
              existing.forEach((l) => existingDomains.add(l.domain));
            }

            if (emailLeads.length > 0) {
              const pgEmails = `{${emailLeads
                .map((l) => `"${l.email!.replace(/"/g, '\\"')}"`)
                .join(',')}}`;
              const existing = (await db`
                SELECT email FROM "Lead"
                WHERE "userId" = ${userId}
                  AND email = ANY(${pgEmails}::text[])
              `) as any[];
              existing.forEach((l) => existingEmails.add(l.email));
            }

            const newLeads = mappedLeads.filter((lead) => {
              if (lead.email) return !existingEmails.has(lead.email);
              if (lead.domain) return !existingDomains.has(lead.domain);
              return false;
            });

            console.log(
              `[LeadExtraction] Found ${newLeads.length} new unique leads from ${source}`
            );

            if (newLeads.length > 0) {
              const leadsToInsert = newLeads.map((lead) => ({
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
                score: lead.confidence || 50,
                technologies: '{}',
                additionalEmails: '{}',
                phoneNumbers: lead.phoneNumbers.length
                  ? `{${lead.phoneNumbers.map((p: string) => `"${p.replace(/"/g, '\\"')}"`).join(',')}}`
                  : '{}',
                physicalAddresses: '{}',
                socialProfiles: null,
                companyInfo: null,
                websiteAudit: null,
                contacted: false,
                emailsSentCount: 0,
                department: lead.department,
                category: inferCategory(lead.industry),
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

              emitter.emit('leads-created', {
                huntSessionId,
                source,
                count: insertedLeads.length,
                totalSoFar: successfulLeads,
                message: `Added ${insertedLeads.length} new leads from ${source}`,
              });
            } else if (extractedLeads.length > 0) {
              emitter.emit('leads-duplicate', {
                huntSessionId,
                source,
                count: extractedLeads.length,
                message: `All ${extractedLeads.length} leads from ${source} were already in database`,
              });
            }

            totalLeads += extractedLeads.length;
          } catch (error) {
            console.error(`[LeadExtraction] Error processing ${source}:`, error);
            sourceStats[source].errors++;
            failedLeads++;
          }

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

        emitter.emit('extraction-completed', {
          huntSessionId,
          totalLeads,
          successfulLeads,
          failedLeads,
          sourceStats,
          message: `Lead extraction completed! Found ${successfulLeads} new leads from ${totalLeads} total results`,
        });
      } catch (error) {
        console.error(`[LeadExtraction] Fatal error for session ${huntSessionId}:`, error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        emitter.emit('extraction-failed', {
          huntSessionId,
          error: errorMessage,
          message: 'Lead extraction failed due to an error',
        });

        await db`
          UPDATE "HuntSession"
          SET status = 'FAILED',
              error = ${errorMessage},
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
        duration: 60000,
      },
    },
  };
}
