import { Hono } from 'hono';
import { loggerMiddleware } from './middleware/logger';
import { db } from '@repo/database';
import { JobHealthMonitor, validateRedisConfiguration } from '@repo/jobs';
import { logger } from '@repo/logger';
import corsHandler from './handlers/cors';
import trpcHandler from './handlers/trpc';
import { openApiHandler } from './handlers/openapi';
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

console.log('[BACKEND] Workers are running in a separate Rust process (packages/rust-workers)');
console.log('[BACKEND] This backend process only manages job queues and API requests');
console.log('[BACKEND] Rust workers are 10-15x faster and more reliable than Node.js workers');

broadcastService.initialize(broadcastToUser, broadcastToAll);

const healthMonitor = new JobHealthMonitor(jobs, db, {
  checkIntervalMs: 60000,
  sessionTimeout: 3600000,
  enableAutoRecovery: true,
});

const jobSyncService = new JobSyncService(db, jobs);

/**
 * validateRedis
 */
async function validateRedis() {
  try {
    console.log('[REDIS] Validating Redis configuration...');
    const validation = await validateRedisConfiguration({
      host: env.REDIS_HOST,
      port: parseInt(env.REDIS_PORT),
      password: env.REDIS_PASSWORD,
      db: parseInt(env.REDIS_DB),
      maxRetriesPerRequest: null,
    });

    /**
     * if
     */
    if (!validation.valid) {
      console.warn('[REDIS] Redis configuration warnings:');
      validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
    } else {
      console.log('[REDIS] Redis configuration is valid');
    }
  } catch (error) {
    console.error('[REDIS] Failed to validate Redis configuration:', error);
  }
}


/**
 * validateRedis
 */
validateRedis();
jobSyncService.syncJobStates();

healthMonitor.start();

const app = new Hono();

app.use('*', corsHandler(env.TRUSTED_ORIGINS));
app.use('*', loggerMiddleware);

app.get('/openapi.json', openApiHandler);

app.get('/health/live', createLivenessHandler());
app.get('/health/ready', createReadinessHandler());

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

    /**
     * if
     */
    if (!message) {
      return c.json({ error: 'Missing message' }, 400);
    }

    /**
     * if
     */
    if (broadcastAll) {
      logger.debug('[INTERNAL] Broadcasting to all users', { messageType: message.type });
      /**
       * broadcastToAll
       */
      broadcastToAll(message);
    } else if (userId) {
      logger.debug('[INTERNAL] Broadcasting to user', { userId: userId.slice(0, 8), messageType: message.type });
      /**
       * broadcastToUser
       */
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

app.get('/', (c) => c.json({ message: 'Welcome to the Glouton\'s API !' }));

const port = Number(env.PORT);

/**
 * gracefulShutdown
 */
async function gracefulShutdown(signal: string) {
  console.log(`\n[SHUTDOWN] Received ${signal}, starting graceful shutdown...`);

  try {
    console.log('[SHUTDOWN] Stopping health monitor...');
    healthMonitor.stop();

    console.log('[SHUTDOWN] Closing BullMQ workers and queues...');
    await jobs.close();
    console.log('[SHUTDOWN] BullMQ workers and queues closed successfully');

    console.log('[SHUTDOWN] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[SHUTDOWN] Error during graceful shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('[ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[ERROR] Uncaught Exception:', error);
  /**
   * gracefulShutdown
   */
  gracefulShutdown('uncaughtException');
});

export default { port, fetch: app.fetch, websocket };
