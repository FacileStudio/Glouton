import { HunterService, type HunterDiscoverFilters } from '@repo/hunter';
import logger from '@repo/logger';
import type {
  LeadSourceProvider,
  LeadSourceFilters,
  LeadSourceResult,
  RateLimitInfo,
} from '../types';

const hunterLogger = logger.child({ service: 'hunter-provider' });

export class HunterProvider implements LeadSourceProvider {
  readonly name = 'HUNTER' as const;

  readonly supportsFilters = {
    type: false,
    seniority: false,
    department: false,
    jobTitles: false,
    location: true,
    verificationStatus: false,
  };

  constructor(private service: HunterService) {}

  async search(filters: LeadSourceFilters): Promise<LeadSourceResult> {
    if (filters.domain) {
      return this.targetedDomain(filters.domain);
    }
    return this.discoverDomains(filters);
  }

  private targetedDomain(raw: string): LeadSourceResult {
    const domain = raw
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .toLowerCase();

    hunterLogger.info({ domain }, 'Returning targeted domain (no API call, no credits)');

    return {
      leads: [
        {
          sourceId: `hunter:domain:${domain}`,
          domain,
          confidence: 100,
          metadata: { domain },
        },
      ],
      total: 1,
      hasMore: false,
    };
  }

  private async discoverDomains(filters: LeadSourceFilters): Promise<LeadSourceResult> {
    const discoverFilters: HunterDiscoverFilters = {
      limit: 100,
    };

    if (filters.location) {
      const loc = filters.location;
      const hasLocation =
        loc.continent || loc.businessRegion || loc.country || loc.state || loc.city;

      if (hasLocation) {
        discoverFilters.headquarters_location = {
          include: [
            {
              continent: loc.continent,
              business_region: loc.businessRegion,
              country: loc.country,
              state: loc.state,
              city: loc.city,
            },
          ],
        };
      }
    }

    if (filters.customFilters?.query) {
      discoverFilters.query = filters.customFilters.query;
    }

    if (filters.customFilters?.industry) {
      discoverFilters.industry = {
        include: ([] as string[]).concat(filters.customFilters.industry),
      };
    }

    if (filters.customFilters?.headcount) {
      discoverFilters.headcount = ([] as string[]).concat(filters.customFilters.headcount);
    }

    hunterLogger.info({ discoverFilters }, 'Calling Discover API (free, no credits consumed)');

    const result = await this.service.discover(discoverFilters);

    if (!result || result.data.length === 0) {
      hunterLogger.warn({ discoverFilters }, 'Discover returned no companies');
      return { leads: [], total: 0, hasMore: false };
    }

    const leads = result.data
      .filter((company) => !!company.domain)
      .map((company) => ({
        sourceId: `hunter:discover:${company.domain}`,
        domain: company.domain,
        confidence: 100,
        metadata: {
          organization: company.organization,
          industry: company.industry,
          headcount: company.headcount,
          location: company.location,
          emailsCount: company.emails_count,
        },
      }));

    hunterLogger.info(
      { domainsFound: leads.length, totalInHunter: result.meta.results },
      'Discover completed — free plan capped at 100 companies per call',
    );

    return {
      leads,
      total: result.meta.results,
      hasMore: false,
    };
  }

  async getRateLimit(): Promise<RateLimitInfo> {
    return {
      remaining: 999,
      total: 999,
      resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }
}
