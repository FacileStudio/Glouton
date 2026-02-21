import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../../trpc';
import userService from './service';

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    return userService.getProfile(ctx.user.id);
  }),

  getConfiguredSources: protectedProcedure
    .input(z.object({ teamId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return userService.getConfiguredSources(ctx.user.id, input?.teamId);
    }),

  list: adminProcedure
    .input(
      z
        .object({
          status: z.enum(['all', 'active', 'suspended', 'banned', 'pending']).optional(),
          role: z.enum(['all', 'admin', 'user']).optional(),
          emailVerified: z.boolean().optional(),
          isPremium: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      return userService.getAllUsers(input);
    }),

  getById: adminProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    return userService.getUserById(input.id);
  }),

  getStats: adminProcedure.query(async () => {
    return userService.getUserStats();
  }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        isPremium: z.boolean().optional(),
        role: z.enum(['USER', 'ADMIN']).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return userService.updateUser(id, data);
    }),

  ban: adminProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return userService.banUser(input.id, input.reason, ctx.user.id);
    }),

  unban: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    return userService.unbanUser(input.id);
  }),

  suspend: adminProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string(),
        until: z.date(),
      })
    )
    .mutation(async ({ input }) => {
      return userService.suspendUser(input.id, input.reason, input.until);
    }),

  unsuspend: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    return userService.unsuspendUser(input.id);
  }),

  verifyEmail: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return userService.verifyEmail(input.id);
    }),

  delete: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    return userService.deleteUser(input.id);
  }),

  bulkDelete: adminProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      return userService.bulkDeleteUsers(input.ids);
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return userService.updateProfile(ctx.user.id, input);
    }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return userService.changePassword(
        ctx.auth,
        ctx.user.id,
        input.currentPassword,
        input.newPassword
      );
    }),

  deleteOwnAccount: protectedProcedure.mutation(async ({ ctx }) => {
    return userService.deleteOwnAccount(ctx.user.id);
  }),

  updateApiKeys: protectedProcedure
    .input(
      z.object({
        hunterApiKey: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return userService.updateApiKeys(ctx.user.id, input);
    }),

  getSmtpConfig: protectedProcedure.query(async ({ ctx }) => {
    return userService.getSmtpConfig(ctx.user.id, ctx.env.ENCRYPTION_SECRET);
  }),

  updateSmtpConfig: protectedProcedure
    .input(
      z.object({
        smtpHost: z.string().optional(),
        smtpPort: z.number().int().min(1).max(65535).optional(),
        smtpSecure: z.boolean().optional(),
        smtpUser: z.string().optional(),
        smtpPass: z.string().optional(),
        smtpFromName: z.string().optional(),
        smtpFromEmail: z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return userService.updateSmtpConfig(ctx.user.id, input, ctx.env.ENCRYPTION_SECRET);
    }),

  testSmtpConfig: protectedProcedure
    .input(
      z.object({
        smtpHost: z.string(),
        smtpPort: z.number().int().min(1).max(65535),
        smtpSecure: z.boolean(),
        smtpUser: z.string(),
        smtpPass: z.string(),
        smtpFromName: z.string(),
        smtpFromEmail: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      const { SMTPService } = await import('@repo/smtp');
      const { TRPCError } = await import('@trpc/server');

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

export default userRouter;
