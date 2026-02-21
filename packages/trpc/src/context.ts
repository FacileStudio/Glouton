import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { type SQL } from 'bun';
import { type PrismaClient } from '@prisma/client';
import { type AuthManager } from '@repo/auth';
import { type ServerEnv } from '@repo/env';
import { QueueManager } from '@repo/jobs';
import type { Logger } from '@repo/logger';

export interface CreateContextOptions extends FetchCreateContextFnOptions {
  db: SQL;
  prisma: PrismaClient;
  authManager: AuthManager;
  env: ServerEnv;
  logger: Logger;
  jobs: QueueManager;
  events?: {
    emit: (userId: string, type: string, data?: any) => void;
    broadcast: (type: string, data?: any) => void;
    emitToScope: (scope: { type: 'personal' | 'team'; userId: string; teamId?: string }, type: string, data?: any) => Promise<void>;
  };
}

export const createContext = async (options: CreateContextOptions) => {
  // Extraction simplifiée du token
  const authHeader = options.req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  
  // Authentification de l'utilisateur
  const user = token ? await options.authManager.verifyToken(token) : null;

  // Logger contextuel (attache l'utilisateur aux logs s'il existe)
  const log = user
    ? options.logger.child({ userId: user.id, email: user.email })
    : options.logger;

  // Récupération de l'IP et du User-Agent
  const ipAddress =
    options.req.headers.get('x-forwarded-for')?.split(',')[0] || // On prend la première IP si liste
    options.req.headers.get('cf-connecting-ip') ||
    undefined;

  const userAgent = options.req.headers.get('user-agent') || undefined;

  return {
    user,
    db: options.db,
    prisma: options.prisma,
    auth: options.authManager,
    env: options.env,
    ipAddress,
    userAgent,
    log,
    jobs: options.jobs,
    events: options.events,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
