import { router, protectedProcedure } from '../../trpc';
import teamService from './service';
import { checkTeamPermission } from './permissions';
import { TeamRole } from '@prisma/client';
import { z } from 'zod';
import {
  createTeamSchema,
  updateTeamSchema,
  addMemberSchema,
  removeMemberSchema,
  updateMemberRoleSchema,
  leaveTeamSchema,
  teamIdSchema,
  updateApiKeysSchema,
  updateSmtpConfigSchema,
} from './schemas';

export const teamRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    ctx.log.info({ userId: ctx.user.id }, '[TEAM] Listing user teams');
    return await teamService.listUserTeams(ctx.user.id);
  }),

  get: protectedProcedure.input(teamIdSchema).query(async ({ ctx, input }) => {
    ctx.log.info({ userId: ctx.user.id, teamId: input.teamId }, '[TEAM] Getting team');
    return await teamService.getTeam(input.teamId, ctx.user.id);
  }),

  create: protectedProcedure.input(createTeamSchema).mutation(async ({ ctx, input }) => {
    ctx.log.info({ userId: ctx.user.id, name: input.name }, '[TEAM] Creating team');
    return await teamService.createTeam(input, ctx.user.id);
  }),

  update: protectedProcedure.input(updateTeamSchema).mutation(async ({ ctx, input }) => {
    ctx.log.info({ userId: ctx.user.id, teamId: input.teamId }, '[TEAM] Updating team');
    const { teamId, ...data } = input;
    return await teamService.updateTeam(teamId, ctx.user.id, data);
  }),

  delete: protectedProcedure.input(teamIdSchema).mutation(async ({ ctx, input }) => {
    ctx.log.info({ userId: ctx.user.id, teamId: input.teamId }, '[TEAM] Deleting team');
    return await teamService.deleteTeam(input.teamId, ctx.user.id);
  }),

  getMembers: protectedProcedure.input(teamIdSchema).query(async ({ ctx, input }) => {
    ctx.log.info(
      { userId: ctx.user.id, teamId: input.teamId },
      '[TEAM] Getting team members'
    );
    return await teamService.getTeamMembers(input.teamId, ctx.user.id);
  }),

  addMember: protectedProcedure.input(addMemberSchema).mutation(async ({ ctx, input }) => {
    ctx.log.info(
      { userId: ctx.user.id, teamId: input.teamId, email: input.email, role: input.role },
      '[TEAM] Adding team member'
    );
    return await teamService.addTeamMember(
      input.teamId,
      ctx.user.id,
      input.email,
      input.role
    );
  }),

  removeMember: protectedProcedure
    .input(removeMemberSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.log.info(
        { requesterId: ctx.user.id, teamId: input.teamId, targetUserId: input.userId },
        '[TEAM] Removing team member'
      );
      return await teamService.removeTeamMember(
        input.teamId,
        ctx.user.id,
        input.userId
      );
    }),

  updateMemberRole: protectedProcedure
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
      return await teamService.updateMemberRole(
        input.teamId,
        ctx.user.id,
        input.userId,
        input.role
      );
    }),

  leave: protectedProcedure.input(leaveTeamSchema).mutation(async ({ ctx, input }) => {
    ctx.log.info({ userId: ctx.user.id, teamId: input.teamId }, '[TEAM] Leaving team');
    return await teamService.leaveTeam(input.teamId, ctx.user.id);
  }),

  getStats: protectedProcedure.input(teamIdSchema).query(async ({ ctx, input }) => {
    ctx.log.info(
      { userId: ctx.user.id, teamId: input.teamId },
      '[TEAM] Getting team stats'
    );
    return await teamService.getTeamStats(input.teamId, ctx.user.id);
  }),

  getApiKeys: protectedProcedure.input(teamIdSchema).query(async ({ ctx, input }) => {
    ctx.log.info(
      { userId: ctx.user.id, teamId: input.teamId },
      '[TEAM] Getting team API keys'
    );
    return await teamService.getTeamApiKeys(input.teamId, ctx.user.id);
  }),

  updateApiKeys: protectedProcedure
    .input(updateApiKeysSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.log.info(
        { userId: ctx.user.id, teamId: input.teamId },
        '[TEAM] Updating team API keys'
      );
      const { teamId, ...apiKeys } = input;
      return await teamService.updateTeamApiKeys(teamId, ctx.user.id, apiKeys);
    }),

  getSmtpConfig: protectedProcedure.input(teamIdSchema).query(async ({ ctx, input }) => {
    ctx.log.info(
      { userId: ctx.user.id, teamId: input.teamId },
      '[TEAM] Getting team SMTP config'
    );
    return await teamService.getTeamSmtpConfig(
      input.teamId,
      ctx.user.id,
      ctx.env.ENCRYPTION_SECRET
    );
  }),

  updateSmtpConfig: protectedProcedure
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
        ctx.env.ENCRYPTION_SECRET
      );
    }),

  testSmtpConfig: protectedProcedure
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
      const { TRPCError } = await import('@trpc/server');

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
});

export default teamRouter;
