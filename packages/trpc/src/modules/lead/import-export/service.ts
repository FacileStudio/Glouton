import { prisma } from '@repo/database/prisma';
import type { LeadStatus, Prisma } from '@prisma/client';
import type { Scope } from '../../../utils/scope';
import { buildLeadFilter } from '../../../utils/scope';
import {
  escapeCSVField,
  escapeCSVArray,
  escapeCSVJson,
  parseCSVLine,
  parseCSVArray,
  parseCSVJson,
  parseCSVBoolean,
  CSV_HEADERS,
} from './csv-utils';

export interface ExportParams {
  scope: Scope;
  leadIds?: string[];
  filters?: {
    status?: LeadStatus;
    search?: string;
    country?: string;
    city?: string;
  };
}

export interface ImportParams {
  userId: string;
  csvContent: string;
}

export default {
  async exportToCsv({ scope, leadIds, filters }: ExportParams): Promise<string> {
    const whereConditions: Prisma.LeadWhereInput = {
      ...buildLeadFilter(scope),
    };

    if (leadIds && leadIds.length > 0) {
      whereConditions.id = { in: leadIds };
    }

    if (filters?.status) {
      whereConditions.status = filters.status;
    }

    if (filters?.country) {
      whereConditions.country = { contains: filters.country, mode: 'insensitive' };
    }

    if (filters?.city) {
      whereConditions.city = { contains: filters.city, mode: 'insensitive' };
    }

    if (filters?.search) {
      whereConditions.OR = [
        { domain: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const leads = await prisma.lead.findMany({
      where: whereConditions,
      orderBy: { createdAt: 'desc' },
    });

    const csvRows: string[] = [CSV_HEADERS.join(',')];

    for (const lead of leads) {
      const row = [
        escapeCSVField(lead.businessName),
        escapeCSVField(lead.businessType),
        escapeCSVField(lead.domain),
        escapeCSVField(lead.email),
        escapeCSVArray(lead.additionalEmails),
        escapeCSVField(lead.firstName),
        escapeCSVField(lead.lastName),
        escapeCSVField(lead.position),
        escapeCSVField(lead.department),
        escapeCSVArray(lead.phoneNumbers),
        escapeCSVArray(lead.physicalAddresses),
        escapeCSVField(lead.category),
        escapeCSVJson(lead.coordinates),
        escapeCSVField(lead.openingHours),
        escapeCSVField(lead.hasWebsite?.toString()),
        escapeCSVField(lead.city),
        escapeCSVField(lead.country),
        escapeCSVField(lead.score?.toString()),
        escapeCSVField(lead.status),
        escapeCSVField(lead.source),
        escapeCSVArray(lead.technologies),
        escapeCSVJson(lead.socialProfiles),
        escapeCSVJson(lead.companyInfo),
        escapeCSVJson(lead.websiteAudit),
        escapeCSVField(lead.contacted?.toString()),
        escapeCSVField(lead.lastContactedAt?.toISOString()),
        escapeCSVField(lead.emailsSentCount?.toString()),
        escapeCSVField(lead.emailVerified?.toString()),
        escapeCSVField(lead.emailVerifiedAt?.toISOString()),
        escapeCSVField(lead.emailVerificationMethod),
      ];
      csvRows.push(row.join(','));
    }

    return csvRows.join('\n');
  },

  async importFromCsv({ userId, csvContent }: ImportParams): Promise<{ created: number; skipped: number }> {
    const lines = csvContent.split('\n').filter(line => line.trim().length > 0);

    if (lines.length === 0) {
      return { created: 0, skipped: 0 };
    }

    const headerLine = lines[0];
    const dataLines = lines.slice(1);

    const leadsToCreate: Prisma.LeadCreateManyInput[] = [];

    for (const line of dataLines) {
      const values = parseCSVLine(line);

      if (values.length < CSV_HEADERS.length) {
        continue;
      }

      const leadData: Prisma.LeadCreateManyInput = {
        userId,
        businessName: values[0] || null,
        businessType: values[1] as any || 'DOMAIN',
        domain: values[2] || null,
        email: values[3] || null,
        additionalEmails: parseCSVArray(values[4]),
        firstName: values[5] || null,
        lastName: values[6] || null,
        position: values[7] || null,
        department: values[8] || null,
        phoneNumbers: parseCSVArray(values[9]),
        physicalAddresses: parseCSVArray(values[10]),
        category: values[11] || null,
        coordinates: parseCSVJson(values[12]),
        openingHours: values[13] || null,
        hasWebsite: values[14] ? parseCSVBoolean(values[14]) : true,
        city: values[15] || null,
        country: values[16] || null,
        score: values[17] ? parseInt(values[17], 10) : 0,
        status: values[18] as any || 'COLD',
        source: values[19] as any || 'HUNTER',
        technologies: parseCSVArray(values[20]),
        socialProfiles: parseCSVJson(values[21]),
        companyInfo: parseCSVJson(values[22]),
        websiteAudit: parseCSVJson(values[23]),
        contacted: values[24] ? parseCSVBoolean(values[24]) : false,
        lastContactedAt: values[25] ? new Date(values[25]) : null,
        emailsSentCount: values[26] ? parseInt(values[26], 10) : 0,
      };

      leadsToCreate.push(leadData);
    }

    if (leadsToCreate.length === 0) {
      return { created: 0, skipped: 0 };
    }

    const result = await prisma.lead.createMany({
      data: leadsToCreate,
      skipDuplicates: true,
    });

    return {
      created: result.count,
      skipped: leadsToCreate.length - result.count,
    };
  },
};
