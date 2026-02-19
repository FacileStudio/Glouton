import { SQL, sql } from 'bun';

function sqlJoin(fragments: any[], separator: any): any {
  return fragments.reduce((acc: any, item: any, i: number) =>
    i === 0 ? item : sql`${acc}${separator}${item}`
  );
}
import type { LeadStatus } from '@repo/database';
import {
  escapeCSVField,
  escapeCSVArray,
  escapeCSVJson,
  CSV_HEADERS,
} from './csv-utils';

export interface ExportParams {
  userId: string;
  leadIds?: string[];
  filters?: {
    status?: LeadStatus;
    search?: string;
    country?: string;
    city?: string;
  };
  db: SQL;
}

export default {
  async exportToCsv({ userId, leadIds, filters, db }: ExportParams): Promise<string> {
    let whereConditions = [sql`"userId" = ${userId}`];

    if (leadIds && leadIds.length > 0) {
      whereConditions.push(sql`id = ANY(${leadIds}::uuid[])`);
    }

    if (filters?.status) {
      whereConditions.push(sql`status = ${filters.status}`);
    }

    if (filters?.country) {
      whereConditions.push(sql`country ILIKE ${`%${filters.country}%`}`);
    }

    if (filters?.city) {
      whereConditions.push(sql`city ILIKE ${`%${filters.city}%`}`);
    }

    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      whereConditions.push(sql`(
        domain ILIKE ${searchTerm} OR
        email ILIKE ${searchTerm} OR
        "firstName" ILIKE ${searchTerm} OR
        "lastName" ILIKE ${searchTerm}
      )`);
    }

    const whereClause = whereConditions.length > 0
      ? sql`WHERE ${sqlJoin(whereConditions, sql` AND `)}`
      : sql``;

    const leads = await db`
      SELECT *
      FROM "Lead"
      ${whereClause}
      ORDER BY "createdAt" DESC
    `;

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
        escapeCSVField(lead.emailVerified === null || lead.emailVerified === undefined ? '' : lead.emailVerified.toString()),
        escapeCSVField(lead.emailVerifiedAt?.toISOString()),
        escapeCSVField(lead.emailVerificationMethod),
      ];
      csvRows.push(row.join(','));
    }

    return csvRows.join('\n');
  },
};
