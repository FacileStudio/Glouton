import { AuthManager } from '@repo/auth';
import { prisma } from '@repo/database';
import { QueueManager, createJobConfig } from '@repo/jobs';
import { redisWebSearch } from '@repo/jobs/workers';
import env from './env';
import { sessionValid } from './services/session';
import { bulleFromEnv } from '@repo/trpc';
import { courrierFromEnv, registreFromEnv } from './services/courrier';

const authManager = new AuthManager({
  encryptionSecret: env.ENCRYPTION_SECRET,
  sessionValid: sessionValid(prisma),
});

const jobs = new QueueManager(
  createJobConfig({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
  })
);

const registre = registreFromEnv(env, prisma, authManager);
const courrier = courrierFromEnv(env, registre);
const bulle = bulleFromEnv(env, registre);
const web = redisWebSearch({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  db: env.REDIS_DB,
});

export default {
  authManager,
  bulle,
  courrier,
  env,
  jobs,
  prisma,
  web,
};
