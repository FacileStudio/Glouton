import { Hono } from 'hono';
import { loggerMiddleware } from './middleware/logger';
import { db } from '@repo/database';
import { JobHealthMonitor, validateRedisConfiguration } from '@repo/jobs';
import { logger } from '@repo/logger';
import corsHandler from './handlers/cors';
import trpcHandler from './handlers/trpc';
import {
  createLivenessHandler,
  createReadinessHandler,
} from './handlers/health';
import { wsHandler, websocket, broadcastToAll, broadcastToUser } from './handlers/websocket';
import { JobSyncService } from './services/job-sync-service';
import { broadcastService } from './services/broadcast-service';
import env from './env';
import config from './config';

const { jobs } = config;

declare global {
  var broadcastNewOpportunities: (opportunities: any[]) => void;
  var broadcastToUser: (userId: string, message: any) => void;
}

broadcastService.initialize(broadcastToUser, broadcastToAll);

const healthMonitor = new JobHealthMonitor(jobs, db, {
  checkIntervalMs: 60000,
  sessionTimeout: 3600000,
  enableAutoRecovery: true,
});

const jobSyncService = new JobSyncService(db, jobs);

async function validateRedis() {
  try {
    const validation = await validateRedisConfiguration({
      host: env.REDIS_HOST,
      port: parseInt(env.REDIS_PORT),
      password: env.REDIS_PASSWORD,
      db: parseInt(env.REDIS_DB),
      maxRetriesPerRequest: null,
    });

    if (!validation.valid) {
      console.warn('[REDIS] Configuration warnings:');
      validation.warnings.forEach(w => console.warn(`  - ${w}`));
    } else {
      console.log('[REDIS] Configuration is valid');
    }
  } catch (error) {
    console.error('[REDIS] Validation failed:', error);
  }
}

// Lancement des vérifications au démarrage
validateRedis();
jobSyncService.syncJobStates();
healthMonitor.start();

const app = new Hono();

app.use('*', corsHandler(env.TRUSTED_ORIGINS));
app.use('*', loggerMiddleware);

// Health Checks (Injection de la DB nécessaire pour Readiness)
app.get('/health/live', createLivenessHandler());
app.get('/health/ready', createReadinessHandler({ db }));

app.get('/ws', wsHandler);

app.get('/internal/ws-status', (c) => {
  const { clients } = require('./handlers/websocket');
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
  try {
    const body = await c.req.json();
    const { userId, message, broadcastAll } = body;

    if (!message) return c.json({ error: 'Missing message' }, 400);

    if (broadcastAll) {
      logger.debug('[INTERNAL] Broadcasting to all users', { type: message.type });
      broadcastToAll(message);
    } else if (userId) {
      logger.debug('[INTERNAL] Broadcasting to user', { userId: userId.slice(0, 8), type: message.type });
      broadcastToUser(userId, message);
    } else {
      return c.json({ error: 'Missing userId or broadcastAll flag' }, 400);
    }

    return c.json({ success: true });
  } catch (error) {
    logger.error('[INTERNAL] Broadcast error', error);
    return c.json({ error: 'Invalid request' }, 400);
  }
});

app.all('/trpc/*', trpcHandler(config));

app.get('/', (c) => c.json({ message: "Welcome to the Glouton's API !" }));

const port = Number(env.PORT);

async function gracefulShutdown(signal: string) {
  console.log(`\n[SHUTDOWN] Received ${signal}, closing...`);
  try {
    healthMonitor.stop();
    await jobs.close();
    console.log('[SHUTDOWN] Success');
    process.exit(0);
  } catch (error) {
    console.error('[SHUTDOWN] Error:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default { port, fetch: app.fetch, websocket };
