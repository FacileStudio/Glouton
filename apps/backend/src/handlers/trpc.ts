import { trpcServer } from '@hono/trpc-server';
import { appRouter, createContext, CreateContextOptions } from '@repo/trpc';
import { Context, Next } from 'hono';

export const trpcHandler =
  ({
    authManager,
    env,
    jobs,
    smtp,
    db,
    events
  }: Omit<CreateContextOptions, 'req' | 'resHeaders' | 'info' | 'logger'>) =>
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
          db,
          jobs,
          smtp,
          logger,
          events,
        });
      },
    })(c, next);

export default trpcHandler;
