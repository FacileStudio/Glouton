import { z } from 'zod';
import { router, protectedProcedure, humanProcedure } from '../../trpc';
import { EmailService } from './service';
import { getAllTemplates, renderTemplate } from '@repo/smtp';
import { resolveScope } from '../../utils/scope';
import { getSmtpConfig } from '../../utils/api-keys';
import { accessForUser } from '../contact/access';
import { sendDraft } from '../inbox/service';
import { courrierFailure, resolveTransport } from './transport';
import { getMailTransport, listCourrierAccounts, setMailTransport, setMailTransportSchema } from './mail-settings';

const optionalTeam = z.object({ teamId: z.string().uuid().optional() }).optional();

export const emailRouter = router({
  getTemplates: protectedProcedure.query(async () => {
    return getAllTemplates();
  }),

  // Single source of truth for "can this scope send emails?" — uses the exact
  // same resolution as sending (team SMTP, falling back to personal SMTP).
  getSmtpStatus: protectedProcedure
    .input(z.object({ teamId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId);
      const transport = await resolveTransport(ctx.prisma, scope, Boolean(ctx.courrier));
      if (transport.kind === 'courrier') return { configured: true, transport: 'courrier' as const };
      const config = await getSmtpConfig(ctx.prisma, scope, ctx.auth);
      return { configured: config !== null, transport: 'smtp' as const };
    }),

  getMailTransport: humanProcedure
    .input(optionalTeam)
    .query(async ({ ctx, input }) => getMailTransport(ctx.prisma, ctx.courrier, ctx.user.id, input?.teamId)),

  listCourrierAccounts: humanProcedure
    .input(optionalTeam)
    .query(async ({ ctx, input }) => listCourrierAccounts(ctx.prisma, ctx.courrier, ctx.user.id, input?.teamId)),

  setMailTransport: humanProcedure.meta({ forfait: { ids: 'unscoped' } })
    .input(setMailTransportSchema)
    .mutation(async ({ ctx, input }) => setMailTransport(ctx.prisma, ctx.courrier, ctx.user.id, input)),

  previewEmail: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
        variables: z.record(
          z.string()
            .max(1000)
            .refine((val) => !val.includes('\r') && !val.includes('\n'), 'Variable cannot contain line breaks')
        ),
      }),
    )
    .query(async ({ input }) => {
      const rendered = renderTemplate(input.templateId, input.variables);
      if (!rendered) {
        throw new Error('Template not found');
      }
      return rendered;
    }),

  sendEmail: humanProcedure.meta({ forfait: { row: { model: 'lead', key: 'leadId' } } })
    .input(
      z.object({
        teamId: z.string().uuid().optional(),
        leadId: z.string(),
        templateId: z.string(),
        variables: z.record(
          z.string()
            .max(1000)
            .refine((val) => !val.includes('\r') && !val.includes('\n'), 'Variable cannot contain line breaks')
        ),
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
        auth: ctx.auth,
        prisma: ctx.prisma,
        courrier: ctx.courrier,
      }).catch(courrierFailure);
    }),

  sendToLead: humanProcedure
    .input(
      z.object({
        teamId: z.string().uuid().optional(),
        leadId: z.string(),
        subject: z.string().trim().min(1).max(300).refine((val) => !/[\r\n]/.test(val), 'Subject cannot contain line breaks'),
        text: z.string().trim().min(1).max(50000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId);
      return new EmailService().sendToLead({
        scope,
        leadId: input.leadId,
        subject: input.subject,
        text: input.text,
        auth: ctx.auth,
        prisma: ctx.prisma,
        courrier: ctx.courrier,
      }).catch(courrierFailure);
    }),

  sendDraft: humanProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) =>
      sendDraft(ctx.prisma, ctx.auth, await accessForUser(ctx.prisma, ctx.user.id, ctx.actor), input.id, ctx.courrier)
    ),

  getLeadOutreach: protectedProcedure.meta({ forfait: { ids: 'scoped' } })
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
