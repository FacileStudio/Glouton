import type { HunterDiscoverFilters } from '@repo/hunter';
import type { DomainFinderData, CompanyData } from './domain-finder.types';
import { prisma } from '@repo/database';

export class DomainFinderHelpers {
  buildDiscoverFilters(data: DomainFinderData): HunterDiscoverFilters {
    const filters: HunterDiscoverFilters = {
      limit: data.filters?.limit || 100,
    };

    if (data.filters?.location) {
      const loc = data.filters.location;
      if (loc.continent || loc.businessRegion || loc.country || loc.state || loc.city) {
        filters.headquarters_location = {
          include: [
            {
              continent: loc.continent,
              business_region: loc.businessRegion as any,
              country: loc.country,
              state: loc.state,
              city: loc.city,
            },
          ],
        };
      }
    }

    if (data.filters?.query) {
      filters.query = data.filters.query;
    }

    if (data.filters?.industry) {
      filters.industry = {
        include: [data.filters.industry].flat(),
      };
    }

    if (data.filters?.headcount) {
      filters.headcount = [data.filters.headcount].flat();
    }

    return filters;
  }

  async createLeadFromCompany(
    company: CompanyData,
    userId: string,
    huntSessionId: string
  ): Promise<void> {
    const now = new Date();
    await prisma.lead.create({
      data: {
        userId,
        huntSessionId,
        source: 'HUNTER',
        domain: company.domain,
        businessName: company.organization || null,
        status: 'COLD',
        score: 70,
        technologies: [],
        additionalEmails: [],
        phoneNumbers: [],
        physicalAddresses: [],
        socialProfiles: null,
        companyInfo: {
          industry: company.industry || null,
          headcount: company.headcount || null,
          emailsCount: (company.emails_count as any)?.total || null,
          location: company.location || null,
        },
        websiteAudit: null,
        contacted: false,
        emailsSentCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    });
  }
}
