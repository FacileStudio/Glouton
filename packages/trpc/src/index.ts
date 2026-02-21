import { router } from './trpc';
import { userRouter } from './modules/user/router';
import { authRouter } from './modules/auth/router';
import { leadRouter } from './modules/lead/router';
import { emailRouter } from './modules/email/router';
import { teamRouter } from './modules/team/router';

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  lead: leadRouter,
  email: emailRouter,
  team: teamRouter,
});

export type AppRouter = typeof appRouter;

export { createContext, type Context, type CreateContextOptions } from './context';
export { publicProcedure, protectedProcedure, adminProcedure } from './trpc';
export { globalCacheFactory } from './cache';
