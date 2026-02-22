import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../../trpc';
import importExportService from './service';
import queryService from '../query/service';
import { exportToCsvSchema, importFromCsvSchema } from '../schemas';
import { resolveScope } from '../../../utils/scope';
import {
  parseCSVLine,
  parseCSVArray,
  parseCSVJson,
  parseCSVBoolean,
} from './csv-utils';

export const importExportRouter = router({
  exportToCsv: protectedProcedure.input(exportToCsvSchema).query(async ({ ctx, input }) => {
    try {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId);
      const csv = await importExportService.exportToCsv({
        scope,
        leadIds: input.leadIds,
        filters: {
          status: input.status,
          search: input.search,
          country: input.country,
          city: input.city,
        },
      });

      const lines = csv.split('\n');
      const count = lines.length - 1;

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
      const lines = input.csvContent.split(/\r?\n/).filter((line) => line.trim());

      if (lines.length < 2) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'CSV file is empty or has no data rows',
        });
      }

      const headers = parseCSVLine(lines[0]);
      const dataLines = lines.slice(1);
      const leads: any[] = [];
      const errors: string[] = [];

      let huntSessionId = input.huntSessionId;

      if (!huntSessionId) {
        const huntSession = await ctx.prisma.huntSession.create({
          data: {
            userId: ctx.user.id,
            teamId: input.teamId || null,
            sources: ['MANUAL'],
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

      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i].trim();
        if (!line) continue;

        try {
          const values = parseCSVLine(line);

          const getHeaderValue = (headerName: string) => {
            const index = headers.indexOf(headerName);
            return index !== -1 ? values[index] : '';
          };

          const domain = getHeaderValue('Domaine');

          if (!domain) {
            errors.push(`Row ${i + 2}: Missing domain`);
            continue;
          }

          const organization = getHeaderValue('Nom Organisation') || domain;
          const city = getHeaderValue('Ville');
          const country = getHeaderValue('Pays');
          const email = getHeaderValue('Email') || `contact@${domain}`;
          const firstName = getHeaderValue('Prenom') || organization.split(' ')[0] || '';
          const lastName = getHeaderValue('Nom') || organization.split(' ').slice(1).join(' ') || '';
          const position = getHeaderValue('Position') || null;
          const department = getHeaderValue('Departement') || null;

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

          const rawEmailVerified = getHeaderValue('Email Verifie');
          const emailVerified = rawEmailVerified === ''
            ? null
            : parseCSVBoolean(rawEmailVerified);

          const rawEmailVerifiedAt = getHeaderValue('Email Verifie Le');
          const emailVerifiedAt = rawEmailVerifiedAt ? new Date(rawEmailVerifiedAt) : null;

          const emailVerificationMethod = getHeaderValue('Methode Verification Email') || null;

          leads.push({
            userId: ctx.user.id,
            teamId: input.teamId || null,
            huntSessionId,
            source,
            sourceId: `manual:${domain}:${i}`,
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
            emailVerified,
            emailVerifiedAt,
            emailVerificationMethod,
          });
        } catch (error) {
          errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Parse error'}`);
        }
      }

      if (leads.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No valid leads found in CSV',
        });
      }

      const dedupResult = await queryService.checkForDuplicates({
        userId: ctx.user.id,
        leads,
        prisma: ctx.prisma,
      });

      const result = await ctx.prisma.lead.createMany({
        data: dedupResult.newLeads,
        skipDuplicates: true,
      });

      ctx.log.info({
        action: 'import-csv-dedup',
        totalLeads: leads.length,
        duplicatesFiltered: dedupResult.duplicatesFiltered,
        imported: result.count,
      });

      await ctx.prisma.huntSession.update({
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
