import { z } from 'zod';
import { router, protectedProcedure } from '../../trpc';
import { EmailService } from './service';
import { getAllTemplates, renderTemplate } from '@repo/smtp';

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
        leadId: z.string(),
        templateId: z.string(),
        variables: z.record(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const emailService = new EmailService();
      return emailService.sendEmail({
        leadId: input.leadId,
        userId: ctx.user.id,
        templateId: input.templateId,
        variables: input.variables,
      });
    }),

  getLeadOutreach: protectedProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const emailService = new EmailService();
      return emailService.getLeadOutreach(input.leadId, ctx.user.id);
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const emailService = new EmailService();
    return emailService.getOutreachStats(ctx.user.id);
  }),

  getAllOutreach: protectedProcedure.query(async ({ ctx }) => {
    const emailService = new EmailService();
    return emailService.getAllOutreach(ctx.user.id);
  }),
});
