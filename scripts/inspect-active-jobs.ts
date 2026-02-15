import { Queue } from 'bullmq';
import { createJobConfig } from '@repo/jobs';

const redisConfig = createJobConfig({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
});

const queue = new Queue('leads', redisConfig);

const activeJobs = await queue.getActive();
console.log(`Found ${activeJobs.length} active jobs:\n`);

/**
 * for
 */
for (const job of activeJobs) {
  console.log(`Job ID: ${job.id}`);
  console.log(`Name: ${job.name}`);
  console.log(`Progress: ${job.progress}`);
  console.log(`Data:`, JSON.stringify(job.data, null, 2));
  console.log(`Timestamp: ${new Date(job.timestamp).toISOString()}`);
  console.log(`ProcessedOn: ${job.processedOn ? new Date(job.processedOn).toISOString() : 'N/A'}`);
  console.log('---');
}

await queue.close();
