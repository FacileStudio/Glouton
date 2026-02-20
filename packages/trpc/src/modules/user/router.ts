import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../../trpc';
import userService from './service';

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    return userService.getProfile(ctx.user.id);
  }),

  getConfiguredSources: protectedProcedure.query(async ({ ctx }) => {
    return userService.getConfiguredSources(ctx.user.id);
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
});

export default userRouter;
