import { z } from 'zod';
import { router, protectedProcedure } from '../../../trpc';
import LeadAuditService from './service';
import { resolveScope } from '../../../utils/scope';

export const listAuditSessionsSchema = z.object({
  teamId: z.string().uuid().optional(),
  leadId: z.string().optional(),
  limit: z.number().min(1).max(100).default(10),
  offset: z.number().min(0).default(0),
});

export const auditRouter = router({
  list: protectedProcedure
    .input(listAuditSessionsSchema.optional())
    .query(async ({ ctx, input = {} }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId);
      return LeadAuditService.list(scope, input, ctx);
    }),

  cancel: protectedProcedure
    .input(z.object({ auditSessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return LeadAuditService.cancel(input.auditSessionId, ctx);
    }),
  start: protectedProcedure
    .input(z.object({ teamId: z.string().uuid().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId);
      return LeadAuditService.start(scope, ctx);
    }),
});
