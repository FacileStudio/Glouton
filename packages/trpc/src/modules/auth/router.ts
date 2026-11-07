import { router, protectedProcedure } from '../../trpc';
import { z } from 'zod';

export const authRouter = router({
  me: protectedProcedure.input(z.object({})).query(({ ctx }) => {
    return ctx.user;
  }),

  logout: protectedProcedure.input(z.object({})).mutation(async ({}) => {
    return { success: true };
  }),
});

export default authRouter;
