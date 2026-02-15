import { HunterService, RateLimitError, type HunterDomainSearchFilters, type HunterDiscoverFilters } from '@repo/hunter';
import logger from '@repo/logger';
import type {
  LeadSourceProvider,
  LeadSourceFilters,
  LeadSourceResult,
  RateLimitInfo,
} from '../types';

const hunterLogger = logger.child({ service: 'hunter' });

export class HunterProvider implements LeadSourceProvider {
  readonly name = 'HUNTER' as const;
  readonly supportsFilters = {
    type: true,
    seniority: true,
    department: true,
    jobTitles: true,
    location: true,
    verificationStatus: true,
  };

  /**
   * constructor
   */
  constructor(private service: HunterService) {}

  /**
   * search
   */
  async search(filters: LeadSourceFilters): Promise<LeadSourceResult> {
    /**
     * if
     */
    if (!filters.domain) {
      return this.broadSearch(filters);
    }

    const hunterFilters: HunterDomainSearchFilters = {
      domain: filters.domain,
      limit: Math.min(filters.limit || 100, 100),
      offset: filters.offset || 0,
      type: filters.type,
      seniority: filters.seniority,
      department: filters.department as any,
      required_field: filters.requiredFields,
      verification_status: filters.verificationStatus,
      job_titles: filters.jobTitles,
      location: filters.location
        ? {
            continent: filters.location.continent,
            business_region: filters.location.businessRegion,
            country: filters.location.country,
            state: filters.location.state,
            city: filters.location.city,
          }
        : undefined,
    };

    hunterLogger.info({ domain: filters.domain, filters: hunterFilters }, 'Starting domain search');

    try {
      const result = await this.service.domainSearch(hunterFilters);
      /**
       * if
       */
      if (!result) {
        hunterLogger.warn({ domain: filters.domain }, 'No results returned from domain search');
        return { leads: [], total: 0, hasMore: false };
      }

      const leads = result.data.emails.map((email) => ({
        sourceId: `hunter:${email.value}`,
        email: email.value,
        firstName: email.first_name,
        lastName: email.last_name,
        position: email.position,
        department: email.department,
        confidence: email.confidence,
        verified: email.confidence >= 80,
        metadata: {
          type: email.type,
          domain: result.data.domain,
          organization: result.data.organization,
        },
      }));

      hunterLogger.info({
        domain: filters.domain,
        leadsFound: leads.length,
        total: result.meta.results,
        hasMore: result.meta.offset + result.meta.limit < result.meta.results,
      }, 'Domain search completed successfully');

      return {
        leads,
        total: result.meta.results,
        hasMore: result.meta.offset + result.meta.limit < result.meta.results,
      };
    } catch (error) {
      hunterLogger.error({ domain: filters.domain, error }, 'Domain search failed');
      throw error;
    }
  }

  /**
   * broadSearch
   */
  private async broadSearch(filters: LeadSourceFilters): Promise<LeadSourceResult> {
    const discoverFilters: HunterDiscoverFilters = {
      limit: 100,
      headquarters_location: filters.location
        ? {
            include: [
              {
                continent: filters.location.continent,
                business_region: filters.location.businessRegion,
                country: filters.location.country,
                state: filters.location.state,
                city: filters.location.city,
              },
            ],
          }
        : undefined,
    };

    hunterLogger.info({ filters: discoverFilters }, 'Starting broad search with Discover API');

    try {
      const discoverResult = await this.service.discover(discoverFilters);
      /**
       * if
       */
      if (!discoverResult || discoverResult.data.length === 0) {
        hunterLogger.warn({ filters: discoverFilters }, 'No companies found with discover filters');
        return { leads: [], total: 0, hasMore: false };
      }

      hunterLogger.info({
        companiesFound: discoverResult.data.length,
        filters: discoverFilters,
      }, 'Found companies via Discover API');

      const allLeads: any[] = [];

      /**
       * for
       */
      for (let i = 0; i < discoverResult.data.length; i++) {
        const company = discoverResult.data[i];
        /**
         * if
         */
        if (!company.domain) continue;

        hunterLogger.info({
          organization: company.organization,
          domain: company.domain,
          progress: `${i + 1}/${discoverResult.data.length}`,
          index: i + 1,
          total: discoverResult.data.length,
        }, 'Fetching emails for company');

        const domainSearchFilters: HunterDomainSearchFilters = {
          domain: company.domain,
          limit: Math.min(filters.limit || 10, 10),
          type: filters.type,
          seniority: filters.seniority,
          department: filters.department as any,
          required_field: filters.requiredFields,
          verification_status: filters.verificationStatus,
          job_titles: filters.jobTitles,
        };

        try {
          const domainResult = await this.service.domainSearch(domainSearchFilters);

          /**
           * if
           */
          if (domainResult && domainResult.data.emails.length > 0) {
            const companyLeads = domainResult.data.emails.map((email) => ({
              sourceId: `hunter:${email.value}`,
              email: email.value,
              firstName: email.first_name,
              lastName: email.last_name,
              position: email.position,
              department: email.department,
              confidence: email.confidence,
              verified: email.confidence >= 80,
              domain: company.domain,
              metadata: {
                type: email.type,
                domain: company.domain,
                organization: company.organization,
                industry: company.industry,
                headcount: company.headcount,
                location: company.location,
              },
            }));

            allLeads.push(...companyLeads);
            hunterLogger.info({
              organization: company.organization,
              domain: company.domain,
              emailsFound: companyLeads.length,
            }, 'Successfully fetched emails for company');
          } else {
            hunterLogger.debug({
              organization: company.organization,
              domain: company.domain,
            }, 'No emails found for company');
          }
        } catch (error) {
          /**
           * if
           */
          if (error instanceof RateLimitError) {
            hunterLogger.warn({
              organization: company.organization,
              domain: company.domain,
              retryAfter: error.retryAfter,
              endpoint: error.endpoint,
            }, 'Rate limit hit while fetching emails - stopping batch processing');
            throw error;
          }

          hunterLogger.error({
            organization: company.organization,
            domain: company.domain,
            error,
          }, 'Failed to fetch emails for company');
        }
      }

      hunterLogger.info({
        totalLeads: allLeads.length,
        companiesProcessed: discoverResult.data.length,
      }, 'Broad search completed successfully');

      return {
        leads: allLeads,
        total: allLeads.length,
        hasMore: false,
      };
    } catch (error) {
      hunterLogger.error({ error, filters: discoverFilters }, 'Broad search failed');
      throw error;
    }
  }

  /**
   * verify
   */
  async verify(email: string): Promise<{ valid: boolean; score: number }> {
    hunterLogger.debug({ email }, 'Verifying email');

    try {
      const result = await this.service.emailVerifier(email);
      /**
       * if
       */
      if (!result) {
        hunterLogger.warn({ email }, 'Email verification returned no result');
        return { valid: false, score: 0 };
      }

      hunterLogger.info({
        email,
        status: result.status,
        score: result.score,
      }, 'Email verification completed');

      return {
        valid: result.status === 'valid',
        score: result.score,
      };
    } catch (error) {
      hunterLogger.error({ email, error }, 'Email verification failed');
      throw error;
    }
  }

  /**
   * getRateLimit
   */
  async getRateLimit(): Promise<RateLimitInfo> {
    return {
      remaining: 25,
      total: 50,
      resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }
}
