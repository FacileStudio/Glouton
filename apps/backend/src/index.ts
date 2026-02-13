import { Hono } from 'hono';
import { loggerMiddleware } from './middleware/logger';
import { createLeadExtractionJob } from '@repo/jobs/workers';
import { db } from '@repo/database';
import corsHandler from './handlers/cors';
import trpcHandler from './handlers/trpc';
import { openApiHandler } from './handlers/openapi';
import {
  createLivenessHandler,
  createReadinessHandler,
} from './handlers/health';
import env from './env';
import config from './config';

const { jobs } = config;

jobs.registerWorker('leads', createLeadExtractionJob(db));

const app = new Hono();

app.use('*', corsHandler(env.TRUSTED_ORIGINS));
app.use('*', loggerMiddleware);

app.get('/openapi.json', openApiHandler);

app.get('/health/live', createLivenessHandler());
app.get('/health/ready', createReadinessHandler());

app.all('/trpc/*', trpcHandler(config));

app.get('/', (c) => c.json({ message: 'Welcome to the Glouton\'s API !' }));

const port = Number(env.PORT);

export default { port, fetch: app.fetch };
