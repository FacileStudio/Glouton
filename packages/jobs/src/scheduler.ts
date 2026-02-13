import type { QueueManager } from './queue-manager';
import type { AddJobOptions } from './types';

export interface ScheduledJobOptions extends Omit<AddJobOptions, 'delay' | 'repeat'> {
  cronExpression?: string;
  every?: number;
  timezone?: string;
}

export class JobScheduler {
  constructor(private queueManager: QueueManager) {}

  async scheduleJob<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    options: ScheduledJobOptions
  ) {
    const { cronExpression, every, timezone, ...jobOptions } = options;

    if (cronExpression) {
      return this.queueManager.addJob(queueName, jobName, data, {
        ...jobOptions,
        repeat: {
          pattern: cronExpression,
          tz: timezone,
        },
      });
    }

    if (every) {
      return this.queueManager.addJob(queueName, jobName, data, {
        ...jobOptions,
        repeat: {
          every,
          tz: timezone,
        },
      });
    }

    throw new Error('Either cronExpression or every must be provided for scheduled jobs');
  }

  async scheduleJobAt<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    timestamp: Date | number,
    options?: AddJobOptions
  ) {
    const delay =
      typeof timestamp === 'number' ? timestamp - Date.now() : timestamp.getTime() - Date.now();

    if (delay < 0) {
      throw new Error('Cannot schedule job in the past');
    }

    return this.queueManager.addJob(queueName, jobName, data, {
      ...options,
      delay,
    });
  }

  async removeRepeatable(queueName: string, jobKey: string): Promise<void> {
    const queue = this.queueManager.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.removeRepeatableByKey(jobKey);
  }

  async getRepeatableJobs(queueName: string) {
    const queue = this.queueManager.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    return queue.getRepeatableJobs();
  }
}
