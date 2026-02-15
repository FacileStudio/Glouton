import logger from '@repo/logger';
import type {
  LeadSourceProvider,
  LeadSourceFilters,
  LeadSourceResult,
  RateLimitInfo,
} from '../types';

const apolloLogger = logger.child({ service: 'apollo' });

export class ApolloProvider implements LeadSourceProvider {
  readonly name = 'APOLLO' as const;
  readonly supportsFilters = {
    type: false,
    seniority: true,
    department: true,
    jobTitles: true,
    location: true,
    verificationStatus: false,
  };

  private readonly baseUrl = 'https://api.apollo.io/v1';

  /**
   * constructor
   */
  constructor(private apiKey: string) {}

  /**
   * search
   */
  async search(filters: LeadSourceFilters): Promise<LeadSourceResult> {
    /**
     * if
     */
    if (!filters.domain) {
      apolloLogger.warn({ filters }, 'No domain provided, skipping search');
      return { leads: [], total: 0, hasMore: false };
    }

    apolloLogger.info({ domain: filters.domain, filters }, 'Starting Apollo search');

    try {
      const response = await fetch(`${this.baseUrl}/mixed_people/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({
          organization_domains: [filters.domain],
          page: Math.floor((filters.offset || 0) / (filters.limit || 25)) + 1,
          per_page: Math.min(filters.limit || 25, 100),
          person_titles: filters.jobTitles,
          person_seniorities: filters.seniority,
          person_locations: filters.location?.city ? [filters.location.city] : undefined,
        }),
      });

      /**
       * if
       */
      if (!response.ok) {
        apolloLogger.error({
          domain: filters.domain,
          status: response.status,
          statusText: response.statusText,
        }, 'Apollo API request failed');
        return { leads: [], total: 0, hasMore: false };
      }

      const data = await response.json();

      /**
       * leads
       */
      const leads = (data.people || []).map((person: any) => ({
        sourceId: `apollo:${person.id}`,
        email: person.email,
        firstName: person.first_name,
        lastName: person.last_name,
        position: person.title,
        department: person.functions?.[0],
        confidence: person.email_status === 'verified' ? 95 : 50,
        verified: person.email_status === 'verified',
        phoneNumber: person.phone_numbers?.[0]?.raw_number,
        metadata: {
          linkedin_url: person.linkedin_url,
          organization: person.organization?.name,
          seniority: person.seniority,
        },
      }));

      apolloLogger.info({
        domain: filters.domain,
        leadsFound: leads.length,
        total: data.pagination?.total_entries || 0,
        hasMore: data.pagination?.page < data.pagination?.total_pages,
      }, 'Apollo search completed successfully');

      return {
        leads,
        total: data.pagination?.total_entries || 0,
        hasMore: data.pagination?.page < data.pagination?.total_pages,
      };
    } catch (error) {
      apolloLogger.error({ domain: filters.domain, error }, 'Apollo search failed');
      return { leads: [], total: 0, hasMore: false };
    }
  }

  /**
   * getRateLimit
   */
  async getRateLimit(): Promise<RateLimitInfo> {
    return {
      remaining: 100,
      total: 10000,
      resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }
}
