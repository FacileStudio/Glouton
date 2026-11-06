import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { type PrismaClient } from '@prisma/client';
import { type AuthManager } from '@repo/auth';
import { type ServerEnv } from '@repo/env';
import { QueueManager } from '@repo/jobs';
import type { Logger } from '@repo/logger';
import type { DelegatedVerifier } from './delegation';
import type { CourrierClient } from '@repo/courrier';
import type { BulleClient } from './modules/assistant/bulle';
import { dbForfait, type ForfaitReader } from './modules/forfait/store';
import type { PlanMode } from './modules/forfait/gate';

export interface CreateContextOptions extends FetchCreateContextFnOptions {
  prisma: PrismaClient;
  authManager: AuthManager;
  env: ServerEnv;
  logger: Logger;
  jobs: QueueManager;
  verifyDelegated?: DelegatedVerifier | null;
  courrier?: CourrierClient | null;
  bulle?: BulleClient | null;
  forfait?: ForfaitReader;
  events?: {
    emit: (userId: string, type: string, data?: any) => void;
    broadcast: (type: string, data?: any) => void;
    emitToScope: (scope: { type: 'personal' | 'team'; userId: string; teamId?: string }, type: string, data?: any) => Promise<void>;
  };
}

export const createContext = async (options: CreateContextOptions) => {
  const authHeader = options.req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  const sessionUser = token ? await options.authManager.verifyToken(token) : null;
  const delegated =
    token && !sessionUser && options.verifyDelegated ? await options.verifyDelegated(token) : null;
  const user = sessionUser ?? delegated?.user ?? null;
  const actor = delegated?.actor ?? null;
  const scopes = delegated?.scopes ?? null;

  const log = user
    ? options.logger.child({ userId: user.id, email: user.email, ...(actor ? { actor } : {}) })
    : options.logger;

  const ipAddress =
    options.req.headers.get('x-forwarded-for')?.split(',')[0] ||
    options.req.headers.get('cf-connecting-ip') ||
    undefined;

  const userAgent = options.req.headers.get('user-agent') || undefined;

  return {
    user,
    actor,
    scopes,
    prisma: options.prisma,
    auth: options.authManager,
    env: options.env,
    ipAddress,
    userAgent,
    log,
    jobs: options.jobs,
    events: options.events,
    courrier: options.courrier ?? null,
    bulle: options.bulle ?? null,
    forfait: options.forfait ?? dbForfait(options.prisma, options.env.OIDC_ISSUER),
    planMode: 'paid' as PlanMode,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
