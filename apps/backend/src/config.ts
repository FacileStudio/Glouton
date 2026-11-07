import { AuthManager } from '@repo/auth';
import { prisma } from '@repo/database';
import { QueueManager, createJobConfig } from '@repo/jobs';
import env from './env';
import { userExists } from './services/session';
import { bulleFromEnv } from '@repo/trpc';
import { courrierFromEnv, registreFromEnv } from './services/courrier';

const authManager = new AuthManager({
  encryptionSecret: env.ENCRYPTION_SECRET,
  userExists: userExists(prisma),
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

export default {
  authManager,
  bulle,
  courrier,
  env,
  jobs,
  prisma,
};
