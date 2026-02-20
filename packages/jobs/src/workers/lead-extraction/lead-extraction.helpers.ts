import type { LeadSourceFilters, LeadData } from '@repo/lead-sources';
import type { MappedLead } from './lead-extraction.types';

export class LeadExtractionHelpers {
  buildSearchFilters(filters: any): LeadSourceFilters {
    return {
      limit: filters?.limit || 100,
      offset: filters?.offset || 0,
      type: filters?.type || 'personal',
      seniority: filters?.seniority,
      department: filters?.department,
      jobTitles: filters?.jobTitles,
      location: filters?.location,
      verificationStatus: filters?.verificationStatus,
    };
  }

  mapLeadsToDatabase(
    leads: LeadData[],
    companyName?: string
  ): MappedLead[] {
    return leads.map((lead) => ({
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
  }

  inferCategory(industry: string | null | undefined): string | null {
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

  prepareLeadInsert(lead: MappedLead, userId: string, huntSessionId: string, source: string): any {
    return {
      userId,
      huntSessionId,
      source: source as any,
      domain: lead.domain,
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      position: lead.jobTitle,
      businessName: lead.company,
      city: lead.city,
      country: lead.country,
      status: 'COLD' as const,
      score: lead.confidence || 50,
      technologies: [],
      additionalEmails: [],
      phoneNumbers: lead.phoneNumbers.length ? lead.phoneNumbers : [],
      physicalAddresses: [],
      socialProfiles: null,
      companyInfo: null,
      websiteAudit: null,
      contacted: false,
      emailsSentCount: 0,
      department: lead.department,
      category: this.inferCategory(lead.industry),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
