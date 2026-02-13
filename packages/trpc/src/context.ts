import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { prisma } from '@repo/database';
import { type AuthManager } from '@repo/auth';
import { type ServerEnv } from '@repo/env';
import { QueueManager } from '@repo/jobs';
import type { Logger } from '@repo/logger';

export interface CreateContextOptions extends FetchCreateContextFnOptions {
  authManager: AuthManager;
  env: ServerEnv;
  logger: Logger;
  jobs: QueueManager;
}

export const createContext = async (options: CreateContextOptions) => {
  const authHeader = options.req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const user = token ? await options.authManager.verifyToken(token) : null;
  const contextLogger = user
    ? options.logger.child({ userId: user.id, email: user.email })
    : options.logger;
  const ipAddress =
    options.req.headers.get('x-forwarded-for') ||
    options.req.headers.get('cf-connecting-ip') ||
    undefined;
  const userAgent = options.req.headers.get('user-agent') || undefined;

  return {
    user,
    db: prisma,
    auth: options.authManager,
    env: options.env,
    ipAddress,
    userAgent,
    log: contextLogger,
    jobs: options.jobs
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
