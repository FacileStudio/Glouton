# @repo/jobs

A powerful job queue system built on BullMQ and Redis for background job processing, scheduling, and task management.

## Features

- **Reliable Job Processing**: Built on BullMQ with Redis for persistent, scalable job queues
- **Multiple Queue Support**: Organize jobs into different queues (email, media, reports, etc.)
- **Job Scheduling**: Schedule jobs with cron expressions or specific timestamps
- **Priority Queues**: Assign priorities to jobs for execution order control
- **Retry Logic**: Automatic retries with configurable backoff strategies
- **Progress Tracking**: Update and monitor job progress in real-time
- **Concurrency Control**: Configure concurrent workers per job type
- **Rate Limiting**: Limit job processing rates to prevent overwhelming external services
- **Type-Safe**: Full TypeScript support with generic job data types

## Installation

The package is already part of the monorepo. To use it in your application:

```typescript
import { QueueManager, createJobConfig } from '@repo/jobs';
```

## Prerequisites

You need Redis running. Install via Docker or Homebrew:

### Docker
```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

### Homebrew (macOS)
```bash
brew install redis
brew services start redis
```

## Quick Start

### 1. Configure Environment Variables

Add to your `.env` file (already included in `apps/backend/.env.example`):

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

### 2. Initialize Queue Manager

```typescript
import { QueueManager, createJobConfig } from '@repo/jobs';

const config = createJobConfig({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
});

const queueManager = new QueueManager(config);
```

### 3. Define a Job

```typescript
import type { JobDefinition } from '@repo/jobs';

interface SendEmailData {
  to: string;
  subject: string;
  body: string;
}

const sendEmailJob: JobDefinition<SendEmailData, void> = {
  name: 'send-email',
  processor: async (job) => {
    const { to, subject, body } = job.data;

    await job.updateProgress(50);

    console.log(`Sending email to ${to}`);

    await job.updateProgress(100);
  },
  options: {
    concurrency: 5,
  },
};
```

### 4. Register Workers

```typescript
queueManager.registerWorker('email', sendEmailJob);
```

### 5. Add Jobs to Queue

```typescript
await queueManager.addJob('email', 'send-email', {
  to: 'user@example.com',
  subject: 'Welcome!',
  body: 'Thanks for signing up!',
});
```

## Advanced Usage

### Job Priorities

```typescript
import { JobPriorities } from '@repo/jobs';

await queueManager.addJob('email', 'send-email', data, {
  priority: JobPriorities.CRITICAL,
});
```

Available priorities:
- `CRITICAL`: 1
- `HIGH`: 5
- `NORMAL`: 10
- `LOW`: 15
- `VERY_LOW`: 20

### Delayed Jobs

```typescript
await queueManager.addJob('email', 'send-email', data, {
  delay: 60000,
});
```

### Retry with Backoff

```typescript
import { CommonBackoffStrategies } from '@repo/jobs';

await queueManager.addJob('email', 'send-email', data, {
  attempts: 5,
  backoff: CommonBackoffStrategies.exponential(3),
});
```

Available strategies:
- `exponential(attemptsMade)`: 1s, 2s, 4s, 8s, etc.
- `fixed(delay)`: Fixed delay between retries
- `linear(attemptsMade, baseDelay)`: 1s, 2s, 3s, etc.

### Scheduled Jobs (Cron)

```typescript
import { JobScheduler } from '@repo/jobs';

const scheduler = new JobScheduler(queueManager);

await scheduler.scheduleJob('email', 'send-email', data, {
  cronExpression: '0 9 * * *',
  timezone: 'America/New_York',
});
```

### Recurring Jobs

```typescript
await scheduler.scheduleJob('reports', 'generate-report', data, {
  every: 3600000,
});
```

### Bulk Jobs

```typescript
await queueManager.addBulkJobs('email', [
  { name: 'send-email', data: { to: 'user1@example.com', ... } },
  { name: 'send-email', data: { to: 'user2@example.com', ... } },
  { name: 'send-email', data: { to: 'user3@example.com', ... } },
]);
```

### Rate Limiting

```typescript
const rateLimitedJob: JobDefinition = {
  name: 'api-call',
  processor: async (job) => {
    // Process job
  },
  options: {
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 1000,
    },
  },
};
```

## Queue Management

### Get Queue Metrics

```typescript
const metrics = await queueManager.getQueueMetrics('email');
console.log(metrics);
```

### Pause/Resume Queue

```typescript
await queueManager.pauseQueue('email');

await queueManager.resumeQueue('email');
```

### Clear Queue

```typescript
await queueManager.clearQueue('email');
```

### Get Jobs

```typescript
const jobs = await queueManager.getJobs('email', ['waiting', 'active', 'failed']);
```

### Retry Failed Job

```typescript
await queueManager.retryJob('email', 'job-id-123');
```

### Remove Job

```typescript
await queueManager.removeJob('email', 'job-id-123');
```

## Integration with Backend

### Example: tRPC Integration

Create a jobs service in your backend:

```typescript
import { QueueManager, createJobConfig } from '@repo/jobs';
import { sendEmailJob } from './jobs/email-jobs';

export const initJobQueue = () => {
  const config = createJobConfig({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
  });

  const queueManager = new QueueManager(config);

  queueManager.registerWorker('email', sendEmailJob);

  return queueManager;
};
```

Add to tRPC context (`packages/trpc/src/context.ts`):

```typescript
import { initJobQueue } from './jobs';

const queueManager = initJobQueue();

export const createContext = async ({ req, res }: CreateContextOptions) => {
  return {
    db,
    auth,
    storage,
    stripe,
    jobs: queueManager,
  };
};
```

Use in tRPC procedures:

```typescript
export const userRouter = router({
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.create({ data: input });

      await ctx.jobs.addJob('email', 'send-email', {
        to: user.email,
        subject: 'Welcome!',
        body: 'Thanks for signing up!',
      });

      return user;
    }),
});
```

## API Reference

### QueueManager

#### `new QueueManager(config: JobConfig)`
Creates a new queue manager instance.

#### `addJob<T>(queueName, jobName, data, options?)`
Adds a single job to the queue.

#### `addBulkJobs<T>(queueName, jobs)`
Adds multiple jobs to the queue at once.

#### `registerWorker(queueName, definition)`
Registers a worker to process jobs in a queue.

#### `registerMultipleWorkers(queueName, definitions)`
Registers multiple workers for a queue.

#### `getQueueMetrics(queueName)`
Gets metrics for a specific queue.

#### `pauseQueue(queueName)`
Pauses job processing for a queue.

#### `resumeQueue(queueName)`
Resumes job processing for a queue.

#### `clearQueue(queueName)`
Removes all jobs from a queue.

#### `close()`
Gracefully shuts down all queues and workers.

### JobScheduler

#### `new JobScheduler(queueManager)`
Creates a new job scheduler instance.

#### `scheduleJob(queueName, jobName, data, options)`
Schedules a recurring job with cron or interval.

#### `scheduleJobAt(queueName, jobName, data, timestamp, options?)`
Schedules a job to run at a specific time.

#### `removeRepeatable(queueName, jobKey)`
Removes a scheduled repeating job.

#### `getRepeatableJobs(queueName)`
Gets all repeating jobs for a queue.

## Examples

See the `examples/` directory for complete working examples:

- `email-jobs.ts`: Email sending jobs
- `image-jobs.ts`: Image processing jobs
- `setup-example.ts`: Complete setup with multiple queues

## Best Practices

1. **Organize by Domain**: Create separate queues for different domains (email, media, reports)
2. **Set Appropriate Concurrency**: Don't overwhelm external services
3. **Use Rate Limiting**: Prevent hitting API rate limits
4. **Implement Idempotency**: Jobs should be safe to retry
5. **Monitor Metrics**: Regularly check queue metrics for issues
6. **Graceful Shutdown**: Always call `queueManager.close()` on app shutdown
7. **Clean Up Old Jobs**: Configure `removeOnComplete` and `removeOnFail`

## Troubleshooting

### Redis Connection Issues

Ensure Redis is running:
```bash
redis-cli ping
```

Check environment variables are correctly set in `.env`.

### Jobs Not Processing

- Verify workers are registered: `queueManager.getAllWorkers()`
- Check queue metrics: `queueManager.getQueueMetrics(queueName)`
- Ensure Redis connection is stable

### High Memory Usage

Configure job cleanup:
```typescript
const config = createJobConfig({
  // ...
});

config.defaultJobOptions = {
  removeOnComplete: {
    age: 3600,
    count: 1000,
  },
  removeOnFail: {
    age: 7 * 24 * 3600,
  },
};
```

## Resources

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Documentation](https://redis.io/docs/)
- [Cron Expression Generator](https://crontab.guru/)
