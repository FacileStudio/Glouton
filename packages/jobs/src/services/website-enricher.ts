import type { SQL } from 'bun';
import { auditWebsite, type AuditResult } from '@repo/audit';
import { scrapeWebsite, type ScrapedData } from '@repo/scraper';
import type { Logger } from '@repo/logger';

export interface EnrichmentResult {
  scrapedData: ScrapedData | null;
  auditData: AuditResult | null;
}

export interface EnrichmentOptions {
  timeout?: number;
  maxRetries?: number;
  includeTechnologies?: boolean;
  includeSEO?: boolean;
  includeSSL?: boolean;
  includeCompanyInfo?: boolean;
  includePerformance?: boolean;
  followContactPage?: boolean;
  followAboutPage?: boolean;
  context?: 'HUNT' | 'AUDIT';
}

export class WebsiteEnricher {
  private logger: Logger;

  /**
   * constructor
   */
  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * enrichDomain
   */
  async enrichDomain(
    domain: string,
    options: EnrichmentOptions = {}
  ): Promise<EnrichmentResult> {
    const url = domain.startsWith('http') ? domain : `https://${domain}`;

    const {
      timeout = 15000,
      maxRetries = 2,
      includeTechnologies = true,
      includeSEO = true,
      includeSSL = true,
      includeCompanyInfo = true,
      includePerformance = false,
      followContactPage = true,
      followAboutPage = true,
      context = 'AUDIT',
    } = options;

    let scrapedData: ScrapedData | null = null;
    let auditData: AuditResult | null = null;

    try {
      scrapedData = await scrapeWebsite(url, {
        timeout,
        followContactPage,
        followAboutPage,
        maxRetries,
        context,
      });
      this.logger.debug(
        { domain, url, hasContactData: !!scrapedData?.contact },
        'Successfully scraped domain'
      );
    } catch (error) {
      this.logger.error(
        {
          domain,
          url,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Failed to scrape domain'
      );
    }

    try {
      auditData = await auditWebsite(url, {
        includeTechnologies,
        includeSEO,
        includeSSL,
        includeCompanyInfo,
        includePerformance,
        timeout,
        maxRetries,
      });
      this.logger.debug(
        {
          domain,
          url,
          technologiesCount: auditData?.technologies?.length || 0,
          hasSEO: !!auditData?.seo,
          hasSSL: !!auditData?.ssl,
        },
        'Successfully audited domain'
      );
    } catch (error) {
      this.logger.error(
        {
          domain,
          url,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Failed to audit domain'
      );
    }

    return { scrapedData, auditData };
  }

  /**
   * enrichLeadsBatch
   */
  async enrichLeadsBatch(
    db: SQL,
    leadIds: string[],
    options: EnrichmentOptions = {}
  ): Promise<void> {
    const leads = await db`
      SELECT id, domain
      FROM "Lead"
      WHERE id IN (${leadIds})
    ` as Promise<any[]>;

    const uniqueDomains = Array.from(new Set(leads.map((l) => l.domain)));
    const domainToLeadIds = new Map<string, string[]>();

    /**
     * for
     */
    for (const lead of leads) {
      const existingIds = domainToLeadIds.get(lead.domain) || [];
      existingIds.push(lead.id);
      domainToLeadIds.set(lead.domain, existingIds);
    }

    /**
     * for
     */
    for (const domain of uniqueDomains) {
      const { scrapedData, auditData } = await this.enrichDomain(domain, options);
      const leadIdsForDomain = domainToLeadIds.get(domain) || [];

      try {
        const updateData: any = {};

        /**
         * if
         */
        if (scrapedData) {
          updateData.additionalEmails = scrapedData.contact.emails;
          updateData.phoneNumbers = scrapedData.contact.phones;
          updateData.physicalAddresses = scrapedData.contact.addresses;
          updateData.socialProfiles = {
            profiles: scrapedData.contact.socialProfiles.map((p) => ({
              platform: p.platform,
              url: p.url,
              username: p.username,
            })),
          };
          updateData.companyInfo = scrapedData.companyInfo;
          updateData.scrapedAt = new Date();
        }

        /**
         * if
         */
        if (auditData) {
          updateData.websiteAudit = {
            technologies: auditData.technologies,
            seo: auditData.seo,
            ssl: auditData.ssl,
            performance: auditData.performance,
          };
          updateData.auditedAt = new Date();

          /**
           * if
           */
          if (auditData.technologies && auditData.technologies.length > 0) {
            updateData.technologies = auditData.technologies.map((t) => t.name);
          }
        }

        /**
         * if
         */
        if (Object.keys(updateData).length > 0) {
                        await db`
                          UPDATE "Lead"
                          SET ${db(updateData)}
                          WHERE id IN (${leadIdsForDomain})
                        `;
          this.logger.debug(
            {
              domain,
              leadsUpdated: leadIdsForDomain.length,
              hasScrapedData: !!scrapedData,
              hasAuditData: !!auditData,
              technologiesFound: auditData?.technologies?.length || 0,
            },
            'Updated leads with enrichment data'
          );
        }
      } catch (error) {
        this.logger.error(
          {
            domain,
            leadsCount: leadIdsForDomain.length,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
          'Failed to update leads with enrichment data'
        );
      }
    }
  }

  /**
   * enrichLeadsForSession
   */
  async enrichLeadsForSession(
    db: SQL,
    sessionId: string,
    sessionType: 'hunt' | 'audit',
    progressCallback: (progress: number) => Promise<void>,
    options: EnrichmentOptions = {}
  ): Promise<void> {
    let leads: any[];
    if (sessionType === 'hunt') {
      leads = await db`
        SELECT id, domain
        FROM "Lead"
        WHERE "huntSessionId" = ${sessionId}
      ` as Promise<any[]>; // Added cast
    } else {
      leads = await db`
        SELECT id, domain
        FROM "Lead"
        WHERE "userId" = ${sessionId}
      ` as Promise<any[]>; // Added cast
    }

    /**
     * if
     */
    if (leads.length === 0) {
      this.logger.debug({ sessionId, sessionType }, 'No leads found for enrichment');
      return;
    }

    const uniqueDomains = Array.from(new Set(leads.map((l) => l.domain)));
    const domainToLeadIds = new Map<string, string[]>();

    /**
     * for
     */
    for (const lead of leads) {
      const existingIds = domainToLeadIds.get(lead.domain) || [];
      existingIds.push(lead.id);
      domainToLeadIds.set(lead.domain, existingIds);
    }

    this.logger.info(
      {
        sessionId,
        sessionType,
        uniqueDomainsCount: uniqueDomains.length,
        totalLeadsCount: leads.length,
      },
      'Starting enrichment phase'
    );

    let completed = 0;
    const batchSize = 3;

    /**
     * for
     */
    for (let i = 0; i < uniqueDomains.length; i += batchSize) {
      const batch = uniqueDomains.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (domain) => {
          await this.sleep(1000 + Math.random() * 2000);
          return { domain, ...(await this.enrichDomain(domain, options)) };
        })
      );

      /**
       * for
       */
      for (const result of results) {
        /**
         * if
         */
        if (result.status === 'fulfilled') {
          const { domain, scrapedData, auditData } = result.value;
          const leadIds = domainToLeadIds.get(domain) || [];

          try {
            const updateData: any = {};

            /**
             * if
             */
            if (scrapedData) {
              updateData.additionalEmails = scrapedData.contact.emails;
              updateData.phoneNumbers = scrapedData.contact.phones;
              updateData.physicalAddresses = scrapedData.contact.addresses;
              updateData.socialProfiles = {
                profiles: scrapedData.contact.socialProfiles.map((p) => ({
                  platform: p.platform,
                  url: p.url,
                  username: p.username,
                })),
              };
              updateData.companyInfo = scrapedData.companyInfo;
              updateData.scrapedAt = new Date();
            }

            /**
             * if
             */
            if (auditData) {
              updateData.websiteAudit = {
                technologies: auditData.technologies,
                seo: auditData.seo,
                ssl: auditData.ssl,
                performance: auditData.performance,
              };
              updateData.auditedAt = new Date();

              /**
               * if
               */
              if (auditData.technologies && auditData.technologies.length > 0) {
                updateData.technologies = auditData.technologies.map((t) => t.name);
              }
            }

            /**
             * if
             */
            if (Object.keys(updateData).length > 0) {
              await db`
                UPDATE "Lead"
                SET ${db(updateData)}
                WHERE id IN (${leadIds})
              `;

              this.logger.debug(
                {
                  domain,
                  leadsUpdated: leadIds.length,
                  hasScrapedData: !!scrapedData,
                  hasAuditData: !!auditData,
                  technologiesFound: auditData?.technologies?.length || 0,
                },
                'Updated leads with enrichment data'
              );
            }
          } catch (error) {
            this.logger.error(
              {
                domain,
                leadsCount: leadIds.length,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
              },
              'Failed to update leads with enrichment data'
            );
          }
        }

        completed++;
        const progressPercent = Math.round((completed / uniqueDomains.length) * 10);
        await progressCallback(90 + progressPercent);
      }
    }

    this.logger.info(
      {
        sessionId,
        sessionType,
        domainsProcessed: uniqueDomains.length,
        completed,
      },
      'Enrichment phase completed'
    );
  }

  /**
   * sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
