import { z } from 'zod';
import { router, protectedProcedure } from '../../../trpc';
import LeadAuditService from './service';

export const listAuditSessionsSchema = z.object({
  leadId: z.string().optional(),
  limit: z.number().min(1).max(100).default(10),
  offset: z.number().min(0).default(0),
});

export const auditRouter = router({
  list: protectedProcedure
    .input(listAuditSessionsSchema.optional())
    .query(async ({ ctx, input = {} }) => {
      return LeadAuditService.list(input, ctx);
    }),

  cancel: protectedProcedure
    .input(z.object({ auditSessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return LeadAuditService.cancel(input.auditSessionId, ctx);
    }),
  start: protectedProcedure.mutation(async ({ ctx, input }) => {
    return LeadAuditService.start(ctx);
  }),
});
