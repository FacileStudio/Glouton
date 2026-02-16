import { router } from './trpc';
import { userRouter } from './modules/user/router';
import { authRouter } from './modules/auth/router';
import { adminRouter } from './modules/admin/router';
import { leadRouter } from './modules/lead/router';
import { emailRouter } from './modules/email/router';

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  admin: adminRouter,
  lead: leadRouter,
  email: emailRouter,
});

export type AppRouter = typeof appRouter;

export { createContext, type Context, type CreateContextOptions } from './context';
export { publicProcedure, protectedProcedure, adminProcedure } from './trpc';
export { globalCacheFactory } from './cache';
