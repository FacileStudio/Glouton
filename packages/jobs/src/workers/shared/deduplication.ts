import { prisma } from '@repo/database';

export interface LeadIdentifier {
  domain?: string | null;
  email?: string | null;
  businessName?: string | null;
}

export class DeduplicationService {
  async findExistingLeadsByDomains(
    userId: string,
    domains: string[]
  ): Promise<Set<string>> {
    const existing = await prisma.lead.findMany({
      where: {
        userId,
        email: null,
        domain: { in: domains },
      },
      select: { domain: true },
    });

    return new Set(existing.map((l) => l.domain).filter(Boolean) as string[]);
  }

  async findExistingLeadsByEmails(
    userId: string,
    emails: string[]
  ): Promise<Set<string>> {
    const existing = await prisma.lead.findMany({
      where: {
        userId,
        email: { in: emails },
      },
      select: { email: true },
    });

    return new Set(existing.map((l) => l.email).filter(Boolean) as string[]);
  }

  async findExistingLeads(
    userId: string,
    identifiers: { domains?: string[]; emails?: string[]; names?: string[] }
  ): Promise<{ domains: Set<string>; emails: Set<string>; names: Set<string> }> {
    const whereConditions: any[] = [];

    if (identifiers.domains?.length) {
      whereConditions.push({ domain: { in: identifiers.domains } });
    }
    if (identifiers.emails?.length) {
      whereConditions.push({ email: { in: identifiers.emails } });
    }
    if (identifiers.names?.length) {
      whereConditions.push({ businessName: { in: identifiers.names } });
    }

    if (whereConditions.length === 0) {
      return { domains: new Set(), emails: new Set(), names: new Set() };
    }

    const existing = await prisma.lead.findMany({
      where: {
        userId,
        OR: whereConditions,
      },
      select: { domain: true, email: true, businessName: true },
    });

    return {
      domains: new Set(existing.map((l) => l.domain).filter(Boolean) as string[]),
      emails: new Set(existing.map((l) => l.email).filter(Boolean) as string[]),
      names: new Set(existing.map((l) => l.businessName).filter(Boolean) as string[]),
    };
  }

  filterNewItems<T>(
    items: T[],
    existingSet: Set<string>,
    keyExtractor: (item: T) => string | null | undefined
  ): T[] {
    return items.filter((item) => {
      const key = keyExtractor(item);
      return key && !existingSet.has(key);
    });
  }

  deduplicateByKey<T>(items: T[], keyExtractor: (item: T) => string | null | undefined): T[] {
    const seen = new Map<string, T>();

    for (const item of items) {
      const key = keyExtractor(item);
      if (key && !seen.has(key)) {
        seen.set(key, item);
      }
    }

    return Array.from(seen.values());
  }
}
