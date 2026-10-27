import { Hono } from 'hono';
import { loggerMiddleware } from './middleware/logger';
import { loginLimiter, registerLimiter } from './middleware/rate-limit';
import { prisma } from '@repo/database';
import { validateRedisConfiguration } from '@repo/jobs';
import { logger } from '@repo/logger';
import corsHandler from './handlers/cors';
import trpcHandler from './handlers/trpc';
import { createAuthRoutes } from './handlers/auth';
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
import env from './env';
import config from './config';

const { jobs } = config;

registerWorkers(jobs, prisma);

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

  const orphaned = await checkOrphanedSessions(prisma, jobs);
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

  setInterval(async () => {
    try {
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

app.get('/ws', wsHandler);

function requireInternalAuth(c: any): boolean {
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

app.use('/trpc/auth.login', loginLimiter);
app.use('/trpc/auth.register', registerLimiter);

app.all('/trpc/*', trpcHandler({
  authManager: config.authManager,
  env: config.env,
  jobs: config.jobs,
  prisma: config.prisma,
  events,
}));

app.get('/', (c) => c.json({ message: "Welcome to the Glouton's API !" }));

const port = Number(env.PORT);

async function gracefulShutdown(signal: string) {
  logger.info(`[SHUTDOWN] Received ${signal}, closing...`);
  try {
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
  logger.error({ error: err }, '[PROCESS] Uncaught exception');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ error: reason }, '[PROCESS] Unhandled rejection');
});

export default { port, fetch: app.fetch, websocket };
