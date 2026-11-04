import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../../trpc';
import { loginSchema, registerSchema } from '@repo/auth-shared';
import authService from './service';
import { z } from 'zod';

/** Password sign-in and sign-up exist only when SSO is not configured at all. */
const assertPasswordAuthEnabled = (ctx: { env: { SSO_ONLY?: boolean; OIDC_ISSUER?: string } }) => {
  if (ctx.env.SSO_ONLY || ctx.env.OIDC_ISSUER) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Password authentication is disabled, use SSO',
    });
  }
};

export const authRouter = router({
  login: publicProcedure.input(loginSchema).mutation(async ({ ctx, input }) => {
    assertPasswordAuthEnabled(ctx);
    return authService.login(ctx.auth, input);
  }),

  register: publicProcedure.input(registerSchema).mutation(async ({ ctx, input }) => {
    assertPasswordAuthEnabled(ctx);
    return authService.register(ctx.auth, input);
  }),

  me: protectedProcedure.input(z.object({})).query(({ ctx }) => {
    return ctx.user;
  }),

  logout: protectedProcedure.input(z.object({})).mutation(async ({}) => {
    return { success: true };
  }),
});

export default authRouter;
