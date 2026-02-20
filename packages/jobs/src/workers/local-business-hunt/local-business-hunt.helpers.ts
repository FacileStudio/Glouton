import type { LocalBusiness } from '@repo/maps';
import { Prisma } from '@prisma/client';

export class LocalBusinessHuntHelpers {
  generateEmail(business: LocalBusiness, location: string): string | null {
    const domain = this.extractDomain(business.website);
    if (!domain) return null;

    const nameSlug = this.createSlug(business.name, 20);
    const businessCity = business.city || business.address?.split(',')[0] || location.split(',')[0];
    const citySlug = this.createSlug(businessCity, 10);

    if (nameSlug && citySlug && nameSlug !== citySlug) {
      return `${nameSlug}-${citySlug}@${domain}`;
    }

    if (nameSlug && !nameSlug.includes(domain.split('.')[0])) {
      return `${nameSlug}@${domain}`;
    }

    const locationSlug = this.createSlug(location.split(',')[0], 10);
    if (citySlug && citySlug !== locationSlug) {
      return `${citySlug}@${domain}`;
    }

    return `contact@${domain}`;
  }

  extractDomain(website: string | undefined): string | null {
    if (!website) return null;
    return website.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0];
  }

  createSlug(text: string, maxLength: number): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, maxLength);
  }

  preparePotentialEmails(businesses: LocalBusiness[], location: string): string[] {
    const potentialEmails = businesses.map(b => {
      const domain = this.extractDomain(b.website);

      if (!domain) return null;

      const nameSlug = this.createSlug(b.name, 20);
      const businessCity = b.city || b.address?.split(',')[0] || location.split(',')[0];
      const citySlug = this.createSlug(businessCity, 10);

      const variants = [`contact@${domain}`];

      if (nameSlug && citySlug && nameSlug !== citySlug) {
        variants.push(`${nameSlug}-${citySlug}@${domain}`);
      }

      if (nameSlug && !nameSlug.includes(domain.split('.')[0])) {
        variants.push(`${nameSlug}@${domain}`);
      }

      const locationSlug = this.createSlug(location.split(',')[0], 10);
      if (citySlug && citySlug !== locationSlug) {
        variants.push(`${citySlug}@${domain}`);
      }

      return variants;
    }).flat().filter(Boolean);

    return Array.from(new Set(potentialEmails.filter(Boolean))) as string[];
  }

  prepareLeadData(
    business: LocalBusiness,
    userId: string,
    huntSessionId: string,
    category: string,
    location: string
  ): any {
    const domain = this.extractDomain(business.website);
    const generatedEmail = this.generateEmail(business, location);
    const phoneNumbers = business.phone ? [business.phone] : [];
    const physicalAddresses = business.address ? [business.address] : [];
    const cityName = business.city || location.split(',')[0].trim() || 'Unknown';

    let countryCode = (business.country || location.split(',').pop()?.trim() || '').toUpperCase();
    countryCode = countryCode && countryCode.length >= 2 ? countryCode : null;

    return {
      userId,
      huntSessionId,
      source: (business.source === 'google-maps' ? 'GOOGLE_MAPS' :
              business.source === 'openstreetmap' ? 'OPENSTREETMAP' : 'GOOGLE_MAPS') as any,
      domain: domain || null,
      email: generatedEmail || null,
      businessName: business.name || 'Unknown Business',
      businessType: 'LOCAL_BUSINESS',
      category: category || 'retail',
      city: cityName || 'Unknown',
      country: countryCode,
      status: 'COLD',
      score: business.hasWebsite ? 60 : 40,
      phoneNumbers,
      physicalAddresses,
      coordinates: business.coordinates as any as Prisma.InputJsonValue,
      hasWebsite: business.hasWebsite || false,
      socialProfiles: {} as Prisma.InputJsonValue,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  isValidBusiness(business: LocalBusiness): boolean {
    return !!(business.coordinates && (business.coordinates.lat !== 0 || business.coordinates.lng !== 0));
  }

  deduplicateByEmail<T>(items: T[], emailExtractor: (item: T) => string | null | undefined): T[] {
    const emailMap = new Map<string, T>();

    for (const item of items) {
      const email = emailExtractor(item);
      if (!email) continue;

      if (!emailMap.has(email)) {
        emailMap.set(email, item);
      }
    }

    return items.filter(item => {
      const email = emailExtractor(item);
      if (!email) return true;
      return emailMap.get(email) === item;
    });
  }
}
