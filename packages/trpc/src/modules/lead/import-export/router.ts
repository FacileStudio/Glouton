import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../../trpc';
import importExportService from './service';
import { exportToCsvSchema, importFromCsvSchema } from '../schemas';
import { resolveScope } from '../../../utils/scope';

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

      const huntData: any = {
        userId: ctx.user.id,
        huntType: 'DOMAIN',
        sources: ['CSV_IMPORT'],
        filters: {},
        status: 'PENDING',
        progress: 0,
        totalLeads: 0,
        successfulLeads: 0,
        failedLeads: 0,
      };

      if (input.teamId) {
        huntData.teamId = input.teamId;
      } else {
        huntData.teamId = null;
      }

      const huntSession = await ctx.prisma.huntSession.create({
        data: huntData,
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
      });

      await ctx.jobs.addJob('csv-import', 'csv-import', {
        huntSessionId: huntSession.id,
        userId: ctx.user.id,
        teamId: input.teamId || null,
        csvContent: input.csvContent,
      });

      ctx.log.info({
        action: 'csv-import-queued',
        huntSessionId: huntSession.id,
        totalRows: lines.length - 1,
      });

      return {
        huntSessionId: huntSession.id,
        status: 'PENDING',
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
        message: 'Failed to queue CSV import',
        cause: error,
      });
    }
  }),
});
