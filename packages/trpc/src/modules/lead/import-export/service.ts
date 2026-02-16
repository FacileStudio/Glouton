import { SQL, sql } from 'bun';
import type { LeadSource, LeadStatus } from '@repo/database';
import {
  parseCSVLine,
  parseCSVArray,
  parseCSVJson,
  parseCSVBoolean,
  escapeCSVField,
  escapeCSVArray,
  escapeCSVJson,
  CSV_HEADERS,
  KIRBY_HEADERS,
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

export interface ImportParams {
  userId: string;
  csvData: string;
  source?: LeadSource;
  huntSessionId?: string;
  checkDuplicates?: boolean;
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
      ? sql`WHERE ${sql.join(whereConditions, sql` AND `)}`
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
        escapeCSVField(lead.id),
        escapeCSVField(lead.userId),
        escapeCSVField(lead.domain),
        escapeCSVField(lead.email),
        escapeCSVField(lead.firstName),
        escapeCSVField(lead.lastName),
        escapeCSVField(lead.jobTitle),
        escapeCSVField(lead.company),
        escapeCSVField(lead.city),
        escapeCSVField(lead.country),
        escapeCSVField(lead.status),
        escapeCSVField(lead.score?.toString()),
        escapeCSVArray(lead.technologies),
        escapeCSVArray(lead.additionalEmails),
        escapeCSVArray(lead.phoneNumbers),
        escapeCSVArray(lead.physicalAddresses),
        escapeCSVJson(lead.socialProfiles),
        escapeCSVJson(lead.companyInfo),
        escapeCSVJson(lead.websiteAudit),
        escapeCSVField(lead.source),
        escapeCSVField(lead.scrapedAt?.toISOString()),
        escapeCSVField(lead.auditedAt?.toISOString()),
        escapeCSVField(lead.huntSessionId),
        escapeCSVField(lead.contacted?.toString()),
        escapeCSVField(lead.lastContactedAt?.toISOString()),
        escapeCSVField(lead.emailsSentCount?.toString()),
        escapeCSVField(lead.createdAt?.toISOString()),
        escapeCSVField(lead.updatedAt?.toISOString()),
      ];
      csvRows.push(row.join(','));
    }

    return csvRows.join('\n');
  },

  async importFromCsv({ userId, csvData, source, huntSessionId, checkDuplicates = true, db }: ImportParams) {
    const lines = csvData.split(/\r?\n/);
    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }

    const headers = parseCSVLine(lines[0]);
    const isKirbyFormat = headers.includes('Email') && headers.includes('URL');

    const leads: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = parseCSVLine(line);

      if (isKirbyFormat) {
        const emailIndex = headers.indexOf('Email');
        const domainIndex = headers.indexOf('URL');
        const firstNameIndex = headers.indexOf('Prénom');
        const lastNameIndex = headers.indexOf('Nom de famille');
        const statusIndex = headers.indexOf('Status');
        const jobTitleIndex = headers.indexOf('Titre');
        const companyIndex = headers.indexOf('Entreprise');
        const cityIndex = headers.indexOf('Localisation');

        const email = values[emailIndex]?.trim() || null;
        const rawDomain = values[domainIndex]?.trim() || null;
        const domain = rawDomain ? new URL(rawDomain).hostname : null;

        if (!email && !domain) continue;

        leads.push({
          userId,
          domain,
          email,
          firstName: values[firstNameIndex]?.trim() || null,
          lastName: values[lastNameIndex]?.trim() || null,
          status: values[statusIndex]?.trim() || 'COLD',
          position: values[jobTitleIndex]?.trim() || null,
          businessName: values[companyIndex]?.trim() || null,
          city: values[cityIndex]?.trim() || null,
          country: null,
          score: 0,
          technologies: [],
          additionalEmails: [],
          phoneNumbers: [],
          physicalAddresses: [],
          socialProfiles: null,
          companyInfo: null,
          websiteAudit: null,
          source: source || 'MANUAL',
          scrapedAt: null,
          auditedAt: null,
          huntSessionId: huntSessionId || null,
          contacted: false,
          lastContactedAt: null,
          emailsSentCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        const idIndex = headers.indexOf('id');
        const userIdIndex = headers.indexOf('userId');
        const domainIndex = headers.indexOf('domain');
        const emailIndex = headers.indexOf('email');
        const firstNameIndex = headers.indexOf('firstName');
        const lastNameIndex = headers.indexOf('lastName');
        const jobTitleIndex = headers.indexOf('jobTitle');
        const companyIndex = headers.indexOf('company');
        const cityIndex = headers.indexOf('city');
        const countryIndex = headers.indexOf('country');
        const statusIndex = headers.indexOf('status');
        const scoreIndex = headers.indexOf('score');
        const technologiesIndex = headers.indexOf('technologies');
        const additionalEmailsIndex = headers.indexOf('additionalEmails');
        const phoneNumbersIndex = headers.indexOf('phoneNumbers');
        const physicalAddressesIndex = headers.indexOf('physicalAddresses');
        const socialProfilesIndex = headers.indexOf('socialProfiles');
        const companyInfoIndex = headers.indexOf('companyInfo');
        const websiteAuditIndex = headers.indexOf('websiteAudit');
        const sourceIndex = headers.indexOf('source');
        const contactedIndex = headers.indexOf('contacted');

        const email = values[emailIndex]?.trim() || null;
        const domain = values[domainIndex]?.trim() || null;

        if (!email && !domain) continue;

        leads.push({
          userId,
          domain,
          email,
          firstName: values[firstNameIndex]?.trim() || null,
          lastName: values[lastNameIndex]?.trim() || null,
          position: values[jobTitleIndex]?.trim() || null,
          businessName: values[companyIndex]?.trim() || null,
          city: values[cityIndex]?.trim() || null,
          country: values[countryIndex]?.trim() || null,
          status: (values[statusIndex]?.trim() as LeadStatus) || 'COLD',
          score: parseInt(values[scoreIndex] || '0') || 0,
          technologies: parseCSVArray(values[technologiesIndex] || ''),
          additionalEmails: parseCSVArray(values[additionalEmailsIndex] || ''),
          phoneNumbers: parseCSVArray(values[phoneNumbersIndex] || ''),
          physicalAddresses: parseCSVArray(values[physicalAddressesIndex] || ''),
          socialProfiles: parseCSVJson(values[socialProfilesIndex] || ''),
          companyInfo: parseCSVJson(values[companyInfoIndex] || ''),
          websiteAudit: parseCSVJson(values[websiteAuditIndex] || ''),
          source: (values[sourceIndex]?.trim() as LeadSource) || source || 'MANUAL',
          scrapedAt: null,
          auditedAt: null,
          huntSessionId: huntSessionId || null,
          contacted: parseCSVBoolean(values[contactedIndex] || 'false'),
          lastContactedAt: null,
          emailsSentCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    if (leads.length === 0) {
      throw new Error('No valid leads found in CSV');
    }

    let leadsToInsert = leads;
    let duplicatesFiltered = 0;

    if (checkDuplicates) {
      const queryService = await import('../query/service');
      const result = await queryService.default.checkForDuplicates({
        userId,
        leads,
        db,
      });
      leadsToInsert = result.newLeads;
      duplicatesFiltered = result.duplicatesFiltered;
    }

    if (leadsToInsert.length === 0) {
      return {
        totalImported: 0,
        duplicatesFiltered,
        message: 'All leads were duplicates',
      };
    }

    const insertedLeads = await db`
      INSERT INTO "Lead" ${sql(leadsToInsert)}
      RETURNING id
    `;

    return {
      totalImported: insertedLeads.length,
      duplicatesFiltered,
      message: `Successfully imported ${insertedLeads.length} leads${duplicatesFiltered > 0 ? `, filtered ${duplicatesFiltered} duplicates` : ''}`,
    };
  },

  async bulkUpdateLeads(leadIds: string[], updates: Partial<any>, userId: string, db: SQL) {
    const updateFields = [];
    const values: any = {};

    if (updates.status !== undefined) {
      updateFields.push(sql`status = ${updates.status}`);
    }
    if (updates.contacted !== undefined) {
      updateFields.push(sql`contacted = ${updates.contacted}`);
    }
    if (updates.score !== undefined) {
      updateFields.push(sql`score = ${updates.score}`);
    }

    if (updateFields.length === 0) {
      throw new Error('No fields to update');
    }

    updateFields.push(sql`"updatedAt" = ${new Date()}`);

    const updateClause = sql.join(updateFields, sql`, `);

    const result = await db`
      UPDATE "Lead"
      SET ${updateClause}
      WHERE id = ANY(${leadIds}::uuid[]) AND "userId" = ${userId}
      RETURNING id
    `;

    return {
      updatedCount: result.length,
      message: `Successfully updated ${result.length} leads`,
    };
  },
};