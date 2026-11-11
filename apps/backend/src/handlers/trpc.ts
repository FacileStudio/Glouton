import { trpcServer } from '@hono/trpc-server';
import { appRouter, createContext, CreateContextOptions } from '@repo/trpc';
import { Context, Next } from 'hono';

export const trpcHandler =
  ({
    authManager,
    env,
    jobs,
    prisma,
    events,
    verifyDelegated,
    courrier,
    bulle,
    web,
    mcp,
  }: Omit<CreateContextOptions, 'req' | 'resHeaders' | 'info' | 'logger' | 'db'>) =>
  (c: Context, next: Next) =>
    trpcServer({
      router: appRouter,
      createContext: async (opts) => {
        const logger = c.get('logger');
        return await createContext({
          ...opts,
          req: c.req.raw,
          authManager,
          env,
          prisma,
          jobs,
          logger,
          events,
          verifyDelegated,
          courrier,
          bulle,
          web,
          mcp,
        });
      },
    })(c, next);

export default trpcHandler;
