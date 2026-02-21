import { z } from 'zod';
import { router, protectedProcedure } from '../../trpc';
import { EmailService } from './service';
import { getAllTemplates, renderTemplate } from '@repo/smtp';
import { resolveScope } from '../../utils/scope';

export const emailRouter = router({
  getTemplates: protectedProcedure.query(async () => {
    return getAllTemplates();
  }),

  previewEmail: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
        variables: z.record(z.string()),
      }),
    )
    .query(async ({ input }) => {
      const rendered = renderTemplate(input.templateId, input.variables);
      if (!rendered) {
        throw new Error('Template not found');
      }
      return rendered;
    }),

  sendEmail: protectedProcedure
    .input(
      z.object({
        teamId: z.string().uuid().optional(),
        leadId: z.string(),
        templateId: z.string(),
        variables: z.record(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId);
      const emailService = new EmailService();
      return emailService.sendEmail({
        scope,
        leadId: input.leadId,
        templateId: input.templateId,
        variables: input.variables,
        encryptionSecret: ctx.env.ENCRYPTION_SECRET,
        prisma: ctx.prisma,
      });
    }),

  getLeadOutreach: protectedProcedure
    .input(z.object({
      leadId: z.string(),
      teamId: z.string().uuid().optional()
    }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId);
      const emailService = new EmailService();
      return emailService.getLeadOutreach(input.leadId, scope, ctx.prisma);
    }),

  getStats: protectedProcedure
    .input(z.object({ teamId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId);
      const emailService = new EmailService();
      return emailService.getOutreachStats(scope, ctx.prisma);
    }),

  getAllOutreach: protectedProcedure
    .input(z.object({ teamId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId);
      const emailService = new EmailService();
      return emailService.getAllOutreach(scope, ctx.prisma);
    }),
});
