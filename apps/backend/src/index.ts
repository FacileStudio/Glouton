import { Hono, type Context } from 'hono';
import { loggerMiddleware } from './middleware/logger';
import { prisma } from '@repo/database';
import { validateRedisConfiguration } from '@repo/jobs';
import { logger } from '@repo/logger';
import corsHandler from './handlers/cors';
import trpcHandler from './handlers/trpc';
import { createAuthRoutes } from './handlers/auth';
import { createAgentRoutes } from './handlers/agent';
import { ARDOISE_ROUTES_PREFIX, createArdoiseRoutes } from './handlers/ardoise';
import { ardoise, forfait } from '@repo/trpc';
import { openApiHandler } from './handlers/openapi';
import { apiReference } from '@scalar/hono-api-reference';
import {
  createLivenessHandler,
  createReadinessHandler,
} from './handlers/health';
import { wsHandler, websocket, broadcastToUser, broadcastToAll, clients } from './handlers/websocket';
import { events } from './services/events';
import { checkOrphanedSessions, cleanupStalled } from './services/job-monitor';
import { registerWorkers } from './services/register-workers';
import { DirectoryClient } from './services/registre-directory';
import { Deletions, DeletionsPath } from './services/registre-deletions';
import { prismaStateStore } from './services/deletion-state';
import { eraseIdentity } from '@repo/database/erase';
import { createRegistreSyncRoutes } from './handlers/registre';
import { applySnapshot, buildImport, startDirectorySync } from './services/registre-spaces';
import { registreIssuer, registreKeys } from './services/oidc';
import { delegatedVerifierFromEnv } from './services/delegated';
import env from './env';
import { readVersion } from './services/version';
import config from './config';

const { jobs } = config;

registerWorkers(jobs, prisma, config.courrier);

events.init({ broadcastToUser, broadcastToAll }, prisma);

async function startup() {
  try {
    const validation = await validateRedisConfiguration({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      maxRetriesPerRequest: null,
    });

    if (!validation.valid) {
      logger.warn({ warnings: validation.warnings }, '[REDIS] Configuration warnings');
    } else {
      logger.info('[REDIS] Configuration valid');
    }
  } catch (error) {
    logger.error({ error }, '[REDIS] Validation failed');
  }

  try {
    await forfait.reportUnlinkedTeams(prisma);
  } catch (error) {
    logger.error({ err: error }, '[FORFAIT] Could not count teams not linked to Registre');
  }

  const orphaned = await checkOrphanedSessions(prisma);
  if (orphaned.audits > 0 || orphaned.hunts > 0) {
    logger.info(`[CLEANUP] Orphaned sessions: ${orphaned.audits} audits, ${orphaned.hunts} hunts`);
  }

  // Schedule opportunity scraper every 3 hours (idempotent job scheduler)
  try {
    await jobs.upsertScheduler(
      'opportunity-scraper',
      'opportunity-scraper-every-3h',
      3 * 60 * 60 * 1000,
      'opportunity-scraper',
      {},
      { removeOnComplete: 5, removeOnFail: 3 }
    );
    // Trigger an immediate first run
    await jobs.addJob('opportunity-scraper', 'opportunity-scraper', { triggeredBy: 'startup' }, {
      delay: 5000,
      removeOnComplete: true,
    });
    logger.info('[OPPORTUNITIES] Scraper scheduled every 3h');
  } catch (err) {
    logger.error({ error: err }, '[OPPORTUNITIES] Failed to schedule scraper');
  }

  try {
    await jobs.upsertScheduler(
      'company-creation',
      'company-creation-every-4h',
      4 * 60 * 60 * 1000,
      'company-creation',
      {},
      { removeOnComplete: 5, removeOnFail: 3 }
    );
    logger.info('[COMPANIES] Creation scraper scheduled every 4h');
  } catch (err) {
    logger.error({ error: err }, '[COMPANIES] Failed to schedule creation scraper');
  }

  try {
    await jobs.upsertScheduler(
      'competitor-watch',
      'competitor-watch-daily',
      24 * 60 * 60 * 1000,
      'competitor-watch',
      {},
      { removeOnComplete: 5, removeOnFail: 3 }
    );
    logger.info('[WATCH] Competitor page monitoring scheduled daily');
  } catch (err) {
    logger.error({ err }, '[WATCH] Failed to schedule competitor page monitoring');
  }

  if (config.courrier) {
    try {
      await jobs.upsertScheduler(
        'courrier-reply-sync',
        'courrier-reply-sync-every-15m',
        15 * 60 * 1000,
        'courrier-reply-sync',
        {},
        { removeOnComplete: 5, removeOnFail: 3 }
      );
      await jobs.upsertScheduler(
        'courrier-contacts-import',
        'courrier-contacts-import-daily',
        24 * 60 * 60 * 1000,
        'courrier-contacts-import',
        {},
        { removeOnComplete: 5, removeOnFail: 3 }
      );
      logger.info('[COURRIER] Reply sync scheduled every 15 min, contact import daily');
    } catch (err) {
      logger.error({ error: err }, '[COURRIER] Failed to schedule Courrier jobs');
    }
  }

  setInterval(async () => {
    try {
      await ardoise.pruneDeliveries(prisma);
      const stalled = await cleanupStalled(prisma);
      if (stalled.audits > 0 || stalled.hunts > 0) {
        logger.info(`[CLEANUP] Stalled sessions: ${stalled.audits} audits, ${stalled.hunts} hunts`);
      }
    } catch (err) {
      logger.error({ error: err }, '[CLEANUP] Cleanup failed');
    }
  }, 30 * 60 * 1000);
}

startup();

const issuer = registreIssuer();
const directoryClient = issuer ? new DirectoryClient(issuer, env.OIDC_CLIENT_ID!, env.OIDC_CLIENT_SECRET!) : null;
const directory = issuer
  ? startDirectorySync({
      remote: directoryClient!,
      collect: () => buildImport(prisma, issuer),
      apply: (snapshot) =>
        applySnapshot(
          { db: prisma, issuer, hashPassword: (p) => config.authManager.hashPassword(p), logger },
          snapshot
        ),
      logger,
    }).syncer
  : null;

const deletions = directoryClient
  ? new Deletions({
      client: directoryClient,
      onPersonDeleted: (provider, subject) => eraseIdentity(prisma, provider, subject),
      state: prismaStateStore(prisma),
      logger,
    })
  : null;
void deletions?.run();

const verifyDelegated = delegatedVerifierFromEnv(env, registreKeys);
const ardoiseSync = ardoise.ardoiseDeps(prisma, env, jobs, logger);

const app = new Hono();

app.use('*', corsHandler([
  'https://glouton.facile.studio',
  env.DOMAIN ?? '',
].filter(Boolean)));
app.use('*', loggerMiddleware);

app.use('*', corsHandler([env.DOMAIN]));

app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('X-XSS-Protection', '0');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const url = new URL(c.req.url);
  if (url.protocol === 'https:') {
    c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
});

app.get('/docs/openapi.json', openApiHandler);
app.get('/docs', apiReference({ url: '/docs/openapi.json', pageTitle: 'Glouton API' }));

app.get('/health/live', createLivenessHandler());
app.get('/health/ready', createReadinessHandler({ prisma }));

app.get('/version', (c) => c.json({ version: readVersion() }));

app.get('/ws', wsHandler);

if (directory) app.route('/', createRegistreSyncRoutes(directory));
if (deletions) app.all(DeletionsPath, (c) => deletions.handler(c.req.raw));

function requireInternalAuth(c: Context): boolean {
  const token = c.req.header('x-internal-secret');
  return token === env.ENCRYPTION_SECRET;
}

app.get('/internal/ws-status', (c) => {
  if (!requireInternalAuth(c)) return c.json({ error: 'Unauthorized' }, 401);
  const status = {
    totalUsers: clients.size,
    users: Array.from(clients.entries()).map(([userId, connections]) => ({
      userId: userId.slice(0, 8),
      connections: connections.size,
    })),
  };
  return c.json(status);
});

app.post('/internal/broadcast', async (c) => {
  if (!requireInternalAuth(c)) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const body = await c.req.json();
    const { userId, message, broadcastAll } = body;

    if (!message) return c.json({ error: 'Missing message' }, 400);

    if (broadcastAll) {
      events.broadcast(message.type, message.data);
    } else if (userId) {
      events.emit(userId, message.type, message.data);
    } else {
      return c.json({ error: 'Missing userId or broadcastAll flag' }, 400);
    }

    return c.json({ success: true });
  } catch (error) {
    logger.error({ error }, '[INTERNAL] Broadcast error');
    return c.json({ error: 'Invalid request' }, 400);
  }
});

app.route('/auth', createAuthRoutes(config.authManager));

app.route(ARDOISE_ROUTES_PREFIX, createArdoiseRoutes({
  ...ardoiseSync,
  notify: (scope, type, data) => events.emitToScope(scope, type, data),
}));

app.route('/api/agent', createAgentRoutes({
  prisma,
  hooks: ardoiseSync.hooks,
  verifySession: (token) => config.authManager.verifyToken(token),
  verifyDelegated,
  notify: (scope, type, data) => events.emitToScope(scope, type, data),
}));

app.all('/trpc/*', trpcHandler({
  authManager: config.authManager,
  env: config.env,
  jobs: config.jobs,
  prisma: config.prisma,
  events,
  verifyDelegated,
  courrier: config.courrier,
  bulle: config.bulle,
}));

app.get('/', (c) => c.json({ message: "Welcome to the Glouton's API !" }));

const port = Number(env.PORT);

async function gracefulShutdown(signal: string) {
  logger.info(`[SHUTDOWN] Received ${signal}, closing...`);
  try {
    deletions?.stop();
    await jobs.close();
    logger.info('[SHUTDOWN] Success');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, '[SHUTDOWN] Error');
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error({ err }, '[PROCESS] Uncaught exception');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, '[PROCESS] Unhandled rejection');
});

export default { port, fetch: app.fetch, websocket };
