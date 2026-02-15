import { AuthManager } from '@repo/auth';
import { db } from '@repo/database';
import { QueueManager, createJobConfig } from '@repo/jobs';
import { SMTPService } from '@repo/smtp';
import env from './env';

const authManager = new AuthManager({
  encryptionSecret: env.ENCRYPTION_SECRET,
});

const jobs = new QueueManager(
  /**
   * createJobConfig
   */
  createJobConfig({
    host: env.REDIS_HOST,
    port: parseInt(env.REDIS_PORT),
    password: env.REDIS_PASSWORD,
    db: parseInt(env.REDIS_DB),
  })
);

const smtp = new SMTPService({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
  from: {
    name: env.SMTP_FROM_NAME,
    email: env.SMTP_FROM_EMAIL,
  },
});

export default {
  authManager,
  env,
  jobs,
  smtp,
  db,
};
