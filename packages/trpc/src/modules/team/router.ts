import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, humanProcedure } from '../../trpc';
import teamService from './service';
import { checkTeamPermission, TeamRole } from './permissions';
import { manageUrl, refuseCreateWhenManaged, refuseWhenLinked, registreSpacesUrl } from './registre';
import { z } from 'zod';
import {
  createTeamSchema,
  updateTeamSchema,
  addMemberSchema,
  removeMemberSchema,
  updateMemberRoleSchema,
  leaveTeamSchema,
  teamIdSchema,
  updateSmtpConfigSchema,
  createWebhookSchema,
  updateWebhookSchema,
  deleteWebhookSchema,
  testWebhookSchema,
} from './schemas';

export const teamRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    ctx.log.info({ userId: ctx.user.id }, '[TEAM] Listing user teams');
    return await teamService.listUserTeams(ctx.user.id);
  }),

  get: protectedProcedure.input(teamIdSchema).query(async ({ ctx, input }) => {
    ctx.log.info({ userId: ctx.user.id, teamId: input.teamId }, '[TEAM] Getting team');
    const team = await teamService.getTeam(input.teamId, ctx.user.id);
    return { ...team, manageUrl: manageUrl(ctx.env, team.registreSpaceId) };
  }),

  directory: protectedProcedure.query(({ ctx }) => ({ spacesUrl: registreSpacesUrl(ctx.env) })),

  create: humanProcedure.input(createTeamSchema).mutation(async ({ ctx, input }) => {
    ctx.log.info({ userId: ctx.user.id, name: input.name }, '[TEAM] Creating team');
    refuseCreateWhenManaged(ctx.env);
    return await teamService.createTeam(input, ctx.user.id);
  }),

  update: humanProcedure.input(updateTeamSchema).mutation(async ({ ctx, input }) => {
    ctx.log.info({ userId: ctx.user.id, teamId: input.teamId }, '[TEAM] Updating team');
    const { teamId, ...data } = input;
    if (data.name !== undefined) await refuseWhenLinked(ctx.env, teamId, data.name);
    return await teamService.updateTeam(teamId, ctx.user.id, data);
  }),

  delete: humanProcedure.input(teamIdSchema).mutation(async ({ ctx, input }) => {
    ctx.log.info({ userId: ctx.user.id, teamId: input.teamId }, '[TEAM] Deleting team');
    await checkTeamPermission(ctx.user.id, input.teamId, TeamRole.OWNER);
    await refuseWhenLinked(ctx.env, input.teamId);
    return await teamService.deleteTeam(input.teamId, ctx.user.id);
  }),

  getMembers: protectedProcedure.input(teamIdSchema).query(async ({ ctx, input }) => {
    ctx.log.info(
      { userId: ctx.user.id, teamId: input.teamId },
      '[TEAM] Getting team members'
    );
    return await teamService.getTeamMembers(input.teamId, ctx.user.id);
  }),

  addMember: humanProcedure.input(addMemberSchema).mutation(async ({ ctx, input }) => {
    ctx.log.info(
      { userId: ctx.user.id, teamId: input.teamId, email: input.email, role: input.role },
      '[TEAM] Adding team member'
    );
    await checkTeamPermission(ctx.user.id, input.teamId, TeamRole.ADMIN);
    await refuseWhenLinked(ctx.env, input.teamId);
    return await teamService.addTeamMember(
      input.teamId,
      ctx.user.id,
      input.email,
      input.role
    );
  }),

  removeMember: humanProcedure
    .input(removeMemberSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.log.info(
        { requesterId: ctx.user.id, teamId: input.teamId, targetUserId: input.userId },
        '[TEAM] Removing team member'
      );
      await checkTeamPermission(ctx.user.id, input.teamId, TeamRole.ADMIN);
      await refuseWhenLinked(ctx.env, input.teamId);
      return await teamService.removeTeamMember(
        input.teamId,
        ctx.user.id,
        input.userId
      );
    }),

  updateMemberRole: humanProcedure
    .input(updateMemberRoleSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.log.info(
        {
          requesterId: ctx.user.id,
          teamId: input.teamId,
          targetUserId: input.userId,
          newRole: input.role,
        },
        '[TEAM] Updating member role'
      );
      await checkTeamPermission(ctx.user.id, input.teamId, TeamRole.OWNER);
      await refuseWhenLinked(ctx.env, input.teamId);
      return await teamService.updateMemberRole(
        input.teamId,
        ctx.user.id,
        input.userId,
        input.role
      );
    }),

  leave: humanProcedure.input(leaveTeamSchema).mutation(async ({ ctx, input }) => {
    ctx.log.info({ userId: ctx.user.id, teamId: input.teamId }, '[TEAM] Leaving team');
    await checkTeamPermission(ctx.user.id, input.teamId, TeamRole.MEMBER);
    await refuseWhenLinked(ctx.env, input.teamId);
    return await teamService.leaveTeam(input.teamId, ctx.user.id);
  }),

  getStats: protectedProcedure.input(teamIdSchema).query(async ({ ctx, input }) => {
    ctx.log.info(
      { userId: ctx.user.id, teamId: input.teamId },
      '[TEAM] Getting team stats'
    );
    return await teamService.getTeamStats(input.teamId, ctx.user.id);
  }),

  getSmtpConfig: humanProcedure.input(teamIdSchema).query(async ({ ctx, input }) => {
    ctx.log.info(
      { userId: ctx.user.id, teamId: input.teamId },
      '[TEAM] Getting team SMTP config'
    );

    return await teamService.getTeamSmtpConfig(
      input.teamId,
      ctx.user.id,
      ctx.auth
    );
  }),

  updateSmtpConfig: humanProcedure
    .input(updateSmtpConfigSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.log.info(
        { userId: ctx.user.id, teamId: input.teamId },
        '[TEAM] Updating team SMTP config'
      );

      const { teamId, ...smtpConfig } = input;
      return await teamService.updateTeamSmtpConfig(
        teamId,
        ctx.user.id,
        smtpConfig,
        ctx.auth
      );
    }),

  testSmtpConfig: humanProcedure
    .input(
      z.object({
        teamId: z.string(),
        smtpHost: z.string(),
        smtpPort: z.number().int().min(1).max(65535),
        smtpSecure: z.boolean(),
        smtpUser: z.string(),
        smtpPass: z.string(),
        smtpFromName: z.string(),
        smtpFromEmail: z.string().email(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { SMTPService } = await import('@repo/smtp');

      await checkTeamPermission(ctx.user.id, input.teamId, TeamRole.ADMIN);

      const testSmtp = new SMTPService({
        host: input.smtpHost,
        port: input.smtpPort,
        secure: input.smtpSecure,
        auth: {
          user: input.smtpUser,
          pass: input.smtpPass,
        },
        from: {
          name: input.smtpFromName,
          email: input.smtpFromEmail,
        },
      });

      try {
        const isValid = await testSmtp.verifyConnection();
        await testSmtp.close();

        if (!isValid) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'La vérification de la connexion SMTP a échoué',
          });
        }

        return { success: true, message: 'Configuration SMTP valide' };
      } catch (error) {
        await testSmtp.close().catch(() => {});

        if (error instanceof TRPCError) {
          throw error;
        }

        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Configuration SMTP invalide : ${errorMessage}`,
        });
      }
    }),

  listWebhooks: protectedProcedure.input(teamIdSchema).query(async ({ ctx, input }) => {
    ctx.log.info(
      { userId: ctx.user.id, teamId: input.teamId },
      '[TEAM] Listing team webhooks'
    );
    return await teamService.listTeamWebhooks(input.teamId, ctx.user.id);
  }),

  createWebhook: humanProcedure
    .input(createWebhookSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.log.info(
        { userId: ctx.user.id, teamId: input.teamId, name: input.name },
        '[TEAM] Creating team webhook'
      );
      const { teamId, ...data } = input;
      return await teamService.createTeamWebhook(teamId, ctx.user.id, data);
    }),

  updateWebhook: humanProcedure
    .input(updateWebhookSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.log.info(
        { userId: ctx.user.id, teamId: input.teamId, webhookId: input.webhookId },
        '[TEAM] Updating team webhook'
      );
      const { teamId, webhookId, ...data } = input;
      return await teamService.updateTeamWebhook(teamId, ctx.user.id, webhookId, data);
    }),

  deleteWebhook: humanProcedure
    .input(deleteWebhookSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.log.info(
        { userId: ctx.user.id, teamId: input.teamId, webhookId: input.webhookId },
        '[TEAM] Deleting team webhook'
      );
      return await teamService.deleteTeamWebhook(input.teamId, ctx.user.id, input.webhookId);
    }),

  testWebhook: humanProcedure
    .input(testWebhookSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.log.info(
        { userId: ctx.user.id, teamId: input.teamId },
        '[TEAM] Testing team webhook'
      );
      return await teamService.testTeamWebhook(input.teamId, ctx.user.id, input.url);
    }),
});

export default teamRouter;
