import { Hono } from 'hono';
import { loggerMiddleware } from './middleware/logger';
import { db } from '@repo/database';
import { validateRedisConfiguration } from '@repo/jobs';
import { logger } from '@repo/logger';
import corsHandler from './handlers/cors';
import trpcHandler from './handlers/trpc';
import {
  createLivenessHandler,
  createReadinessHandler,
} from './handlers/health';
import { wsHandler, websocket, broadcastToUser, broadcastToAll } from './handlers/websocket';
import { events } from './services/events';
import { checkOrphanedSessions, cleanupStalled } from './services/job-monitor';
import { registerWorkers } from './services/register-workers';
import env from './env';
import config from './config';

const { jobs } = config;

// Register workers with database
registerWorkers(jobs, db);

// Initialize event system with websocket broadcaster
events.init({ broadcastToUser, broadcastToAll });

// Simple startup tasks
async function startup() {
  // Validate Redis
  try {
    const validation = await validateRedisConfiguration({
      host: env.REDIS_HOST,
      port: parseInt(env.REDIS_PORT),
      password: env.REDIS_PASSWORD,
      db: parseInt(env.REDIS_DB),
      maxRetriesPerRequest: null,
    });

    if (!validation.valid) {
      console.warn('[REDIS] Configuration warnings:', validation.warnings);
    } else {
      console.log('[REDIS] Configuration valid');
    }
  } catch (error) {
    console.error('[REDIS] Validation failed:', error);
  }

  // Clean up orphaned sessions
  const orphaned = await checkOrphanedSessions(db, jobs);
  if (orphaned.audits > 0 || orphaned.hunts > 0) {
    console.log(`[CLEANUP] Orphaned sessions: ${orphaned.audits} audits, ${orphaned.hunts} hunts`);
  }

  // Schedule periodic cleanup (every 30 minutes)
  setInterval(async () => {
    const stalled = await cleanupStalled(db);
    if (stalled.audits > 0 || stalled.hunts > 0) {
      console.log(`[CLEANUP] Stalled sessions: ${stalled.audits} audits, ${stalled.hunts} hunts`);
    }
  }, 30 * 60 * 1000);
}

startup();

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
      events.broadcast(message.type, message.data);
    } else if (userId) {
      events.emit(userId, message.type, message.data);
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
