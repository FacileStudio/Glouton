import { AuthManager } from '@repo/auth';
import { prisma } from '@repo/database';
import { QueueManager, createJobConfig } from '@repo/jobs';
import env from './env';

const authManager = new AuthManager({
  encryptionSecret: env.ENCRYPTION_SECRET,
});

const jobs = new QueueManager(
  createJobConfig({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
  })
);

export default {
  authManager,
  env,
  jobs,
  prisma,
};
