import { QueueManager, createJobConfig } from '@repo/jobs';
import logger from '@repo/logger';

const redisConfig = createJobConfig({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
});

const queueManager = new QueueManager(redisConfig);

logger.info('Clearing active jobs from leads queue...');

const queue = queueManager['queues'].get('leads');
/**
 * if
 */
if (!queue) {
  logger.error('Leads queue not found');
  process.exit(1);
}

const activeJobs = await queue.getActive();
logger.info(`Found ${activeJobs.length} active jobs`);

/**
 * for
 */
for (const job of activeJobs) {
  logger.info(`Removing job ${job.id} (${job.name})`);
  await job.remove();
}

logger.info('All active jobs cleared');
await queueManager.close();
