import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { type SQL } from 'bun'; // Import du type SQL de Bun
import { type AuthManager } from '@repo/auth';
import { type ServerEnv } from '@repo/env';
import { QueueManager } from '@repo/jobs';
import type { Logger } from '@repo/logger';
import type { SMTPService } from '@repo/smtp';

export interface CreateContextOptions extends FetchCreateContextFnOptions {
  db: SQL; // Injection de l'instance DB (Bun SQL)
  authManager: AuthManager;
  env: ServerEnv;
  logger: Logger;
  jobs: QueueManager;
  smtp?: SMTPService;
  events?: {
    emit: (userId: string, type: string, data?: any) => void;
    broadcast: (type: string, data?: any) => void;
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
    db: options.db, // Utilisation de l'instance passée en option
    auth: options.authManager,
    env: options.env,
    ipAddress,
    userAgent,
    log,
    jobs: options.jobs,
    smtp: options.smtp,
    events: options.events,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
