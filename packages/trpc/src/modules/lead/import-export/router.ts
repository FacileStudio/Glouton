import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../../trpc';
import importExportService from './service';
import queryService from '../query/service';
import { exportToCsvSchema, importFromCsvSchema } from '../schemas';
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

export const importExportRouter = router({
  exportToCsv: protectedProcedure.input(exportToCsvSchema).query(async ({ ctx, input }) => {
    try {
      // Use the service's exportToCsv method which properly uses raw SQL
      const csv = await importExportService.exportToCsv({
        userId: ctx.user.id,
        leadIds: input.leadIds,
        filters: {
          status: input.status,
          search: input.search,
          country: input.country,
          city: input.city,
        },
        db: ctx.db,
      });

      // Count the number of leads (excluding the header)
      const lines = csv.split('\n');
      const count = lines.length - 1; // Subtract 1 for header

      return {
        csv,
        count,
      };
    } catch (error) {
      ctx.log.error({
        action: 'export-csv-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to export leads to CSV',
        cause: error,
      });
    }
  }),

  importFromCsv: protectedProcedure.input(importFromCsvSchema).mutation(async ({ ctx, input }) => {
    try {
      const lines = input.csvContent.split('\n').filter((line) => line.trim());

      /**
       * if
       */
      if (lines.length < 2) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'CSV file is empty or has no data rows',
        });
      }

      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

      const isKirbyFormat = KIRBY_HEADERS.every((h) => headers.includes(h));

      const dataLines = lines.slice(1);
      const leads: any[] = [];
      const errors: string[] = [];

      let huntSessionId = input.huntSessionId;
      /**
       * if
       */
      if (!huntSessionId) {
        const huntSession = await ctx.db.huntSession.create({
          data: {
            userId: ctx.user.id,
            status: 'COMPLETED',
            progress: 100,
            totalLeads: 0,
            successfulLeads: 0,
            failedLeads: 0,
            startedAt: new Date(),
            completedAt: new Date(),
            sourceStats: { MANUAL: { leads: 0, errors: 0, rateLimited: false } },
          },
        });
        huntSessionId = huntSession.id;
      }

      /**
       * for
       */
      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i].trim();
        /**
         * if
         */
        if (!line) continue;

        try {
          const values = parseCSVLine(line);

          /**
           * getHeaderValue
           */
          const getHeaderValue = (headerName: string) => {
            const index = headers.indexOf(headerName);
            return index !== -1 ? values[index] : '';
          };

          let domain = '';
          let organization = '';
          let city = '';
          let country = '';
          let email = '';
          let firstName = '';
          let lastName = '';
          let position: string | null = null;
          let department: string | null = null;

          /**
           * if
           */
          if (isKirbyFormat) {
            domain = getHeaderValue('Domaine');
            organization = getHeaderValue('Nom Organisation');
            city = getHeaderValue('Ville');
            email = `contact@${domain}`;
            firstName = organization.split(' ')[0] || '';
            lastName = organization.split(' ').slice(1).join(' ') || '';
          } else {
            domain = getHeaderValue('Domaine');
            organization = getHeaderValue('Nom Organisation') || domain;
            city = getHeaderValue('Ville');
            country = getHeaderValue('Pays');
            email = getHeaderValue('Email') || `contact@${domain}`;
            firstName = getHeaderValue('Prenom') || organization.split(' ')[0] || '';
            lastName = getHeaderValue('Nom') || organization.split(' ').slice(1).join(' ') || '';
            position = getHeaderValue('Position') || null;
            department = getHeaderValue('Departement') || null;
          }

          /**
           * if
           */
          if (!domain) {
            errors.push(`Row ${i + 2}: Missing domain`);
            continue;
          }

          const businessTypeStr = getHeaderValue('Type Business');
          const businessType = businessTypeStr === 'LOCAL_BUSINESS' ? 'LOCAL_BUSINESS' : 'DOMAIN';

          const additionalEmails = parseCSVArray(getHeaderValue('Emails Additionnels'));
          const phoneNumbers = parseCSVArray(getHeaderValue('Numeros Telephone'));
          const physicalAddresses = parseCSVArray(getHeaderValue('Adresses Physiques'));
          const technologies = parseCSVArray(getHeaderValue('Technologies'));

          const coordinates = parseCSVJson(getHeaderValue('Coordonnees'));
          const socialProfiles = parseCSVJson(getHeaderValue('Profils Sociaux'));
          const companyInfo = parseCSVJson(getHeaderValue('Info Entreprise'));
          const websiteAudit = parseCSVJson(getHeaderValue('Audit Site Web'));

          const category = getHeaderValue('Categorie') || null;
          const openingHours = getHeaderValue('Horaires Ouverture') || null;
          const hasWebsite = parseCSVBoolean(getHeaderValue('A un Site Web'));

          const statusStr = getHeaderValue('Status');
          const status = ['HOT', 'WARM', 'COLD'].includes(statusStr) ? statusStr : 'COLD';

          const sourceStr = getHeaderValue('Source');
          const source = ['HUNTER', 'APOLLO', 'SNOV', 'HASDATA', 'CONTACTOUT', 'MANUAL', 'GOOGLE_MAPS', 'OPENSTREETMAP'].includes(sourceStr)
            ? sourceStr
            : 'MANUAL';

          const scoreStr = getHeaderValue('Score');
          const score = scoreStr ? parseInt(scoreStr, 10) : 50;

          const contacted = parseCSVBoolean(getHeaderValue('Contacte'));
          const lastContactedAtStr = getHeaderValue('Derniere Date Contact');
          const lastContactedAt = lastContactedAtStr ? new Date(lastContactedAtStr) : null;

          const emailsSentCountStr = getHeaderValue('Nombre Emails Envoyes');
          const emailsSentCount = emailsSentCountStr ? parseInt(emailsSentCountStr, 10) : 0;

          leads.push({
            userId: ctx.user.id,
            huntSessionId,
            source,
            sourceId: `manual:${domain}:${Date.now()}:${i}`,
            businessType,
            domain,
            email,
            additionalEmails,
            firstName,
            lastName,
            position,
            department,
            phoneNumbers,
            physicalAddresses,
            businessName: organization || null,
            category,
            coordinates,
            openingHours,
            hasWebsite,
            city: city || null,
            country: country || null,
            technologies,
            socialProfiles,
            companyInfo,
            websiteAudit,
            status,
            score: isNaN(score) ? 50 : score,
            contacted,
            lastContactedAt,
            emailsSentCount: isNaN(emailsSentCount) ? 0 : emailsSentCount,
          });
        } catch (error) {
          errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Parse error'}`);
        }
      }

      /**
       * if
       */
      if (leads.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No valid leads found in CSV',
        });
      }

      const dedupResult = await queryService.checkForDuplicates({
        userId: ctx.user.id,
        leads,
        db: ctx.db,
      });

      const result = await ctx.db.lead.createMany({
        data: dedupResult.newLeads,
        skipDuplicates: true,
      });

      ctx.log.info({
        action: 'import-csv-dedup',
        totalLeads: leads.length,
        duplicatesFiltered: dedupResult.duplicatesFiltered,
        imported: result.count,
      });

      await ctx.db.huntSession.update({
        where: { id: huntSessionId },
        data: {
          totalLeads: result.count,
          successfulLeads: result.count,
          sourceStats: { MANUAL: { leads: result.count, errors: errors.length, rateLimited: false } },
        },
      });

      ctx.log.info({
        action: 'import-csv',
        huntSessionId,
        leadsImported: result.count,
        errors: errors.length,
      });

      return {
        huntSessionId,
        imported: result.count,
        errors,
        totalRows: dataLines.length,
      };
    } catch (error) {
      /**
       * if
       */
      if (error instanceof TRPCError) {
        throw error;
      }

      ctx.log.error({
        action: 'import-csv-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to import leads from CSV',
        cause: error,
      });
    }
  }),
});
