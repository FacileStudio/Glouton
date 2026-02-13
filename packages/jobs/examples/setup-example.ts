import { QueueManager, JobScheduler, createJobConfig, JobPriorities } from '../src';
import { sendEmailJob, sendBulkEmailJob } from './email-jobs';
import { processImageJob, generateThumbnailJob } from './image-jobs';

const config = createJobConfig({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
});

const queueManager = new QueueManager(config);

queueManager.registerWorker('email', sendEmailJob);
queueManager.registerWorker('email', sendBulkEmailJob);

queueManager.registerWorker('media', processImageJob);
queueManager.registerWorker('media', generateThumbnailJob);

const scheduler = new JobScheduler(queueManager);

async function addSampleJobs() {
  await queueManager.addJob('email', 'send-email', {
    to: 'user@example.com',
    subject: 'Welcome!',
    body: 'Thanks for signing up!',
  }, {
    priority: JobPriorities.HIGH,
    attempts: 3,
  });

  await queueManager.addJob('email', 'send-bulk-email', {
    recipients: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
    subject: 'Newsletter',
    body: 'Check out our latest updates!',
  }, {
    priority: JobPriorities.NORMAL,
  });

  await queueManager.addJob('media', 'process-image', {
    imageUrl: 'https://example.com/image.jpg',
    operations: ['resize', 'compress', 'watermark'],
    outputFormat: 'webp',
  }, {
    delay: 5000,
  });

  await scheduler.scheduleJob('email', 'send-email', {
    to: 'admin@example.com',
    subject: 'Daily Report',
    body: 'Your daily summary...',
  }, {
    cronExpression: '0 9 * * *',
    timezone: 'America/New_York',
  });

  console.log('Sample jobs added successfully!');
}

async function checkQueueMetrics() {
  const emailMetrics = await queueManager.getQueueMetrics('email');
  const mediaMetrics = await queueManager.getQueueMetrics('media');

  console.log('Email Queue Metrics:', emailMetrics);
  console.log('Media Queue Metrics:', mediaMetrics);
}

async function cleanup() {
  console.log('Shutting down gracefully...');
  await queueManager.close();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

export { queueManager, scheduler, addSampleJobs, checkQueueMetrics };
