import { Queue, Worker, type Job as BullJob } from 'bullmq';
import type { JobConfig, JobDefinition, AddJobOptions } from './types';

export class QueueManager {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private config: JobConfig;

  constructor(config: JobConfig) {
    this.config = config;
  }

  private getOrCreateQueue(queueName: string): Queue {
    if (!this.queues.has(queueName)) {
      const queue = new Queue(queueName, {
        connection: this.config.connection,
        defaultJobOptions: this.config.defaultJobOptions,
      });

      this.queues.set(queueName, queue);
    }

    return this.queues.get(queueName)!;
  }

  async addJob<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    options?: AddJobOptions
  ): Promise<BullJob<T>> {
    const queue = this.getOrCreateQueue(queueName);
    return queue.add(jobName, data, options);
  }

  async addBulkJobs<T = any>(
    queueName: string,
    jobs: Array<{ name: string; data: T; opts?: AddJobOptions }>
  ): Promise<BullJob<T>[]> {
    const queue = this.getOrCreateQueue(queueName);
    return queue.addBulk(jobs);
  }

  registerWorker<T = any, R = any>(
    queueName: string,
    definition: JobDefinition<T, R>
  ): Worker {
    if (this.workers.has(`${queueName}:${definition.name}`)) {
      throw new Error(`Worker for ${queueName}:${definition.name} already registered`);
    }

    const worker = new Worker(
      queueName,
      async (job: BullJob<T>) => {
        if (job.name === definition.name) {
          return await definition.processor(job);
        }
      },
      {
        connection: this.config.connection,
        concurrency: definition.options?.concurrency ?? 1,
        limiter: definition.options?.limiter,
      }
    );

    worker.on('completed', (job) => {
      console.log(`Job ${job.id} in queue ${queueName} completed`);
    });

    worker.on('failed', (job, err) => {
      console.error(`Job ${job?.id} in queue ${queueName} failed:`, err.message);
    });

    worker.on('error', (err) => {
      console.error(`Worker error in queue ${queueName}:`, err);
    });

    this.workers.set(`${queueName}:${definition.name}`, worker);
    return worker;
  }

  registerMultipleWorkers(queueName: string, definitions: JobDefinition[]): Worker[] {
    return definitions.map((def) => this.registerWorker(queueName, def));
  }

  async getJob(queueName: string, jobId: string): Promise<BullJob | undefined> {
    const queue = this.getOrCreateQueue(queueName);
    return queue.getJob(jobId);
  }

  async getJobs(queueName: string, types: Array<'waiting' | 'active' | 'completed' | 'failed' | 'delayed'>) {
    const queue = this.getOrCreateQueue(queueName);
    return queue.getJobs(types);
  }

  async getQueueMetrics(queueName: string) {
    const queue = this.getOrCreateQueue(queueName);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.getOrCreateQueue(queueName);
    await queue.pause();
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getOrCreateQueue(queueName);
    await queue.resume();
  }

  async clearQueue(queueName: string): Promise<void> {
    const queue = this.getOrCreateQueue(queueName);
    await queue.drain();
  }

  async removeJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.getJob(queueName, jobId);
    if (job) {
      await job.remove();
    }
  }

  async retryJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.getJob(queueName, jobId);
    if (job) {
      await job.retry();
    }
  }

  async close(): Promise<void> {
    await Promise.all([
      ...Array.from(this.workers.values()).map((worker) => worker.close()),
      ...Array.from(this.queues.values()).map((queue) => queue.close()),
    ]);

    this.workers.clear();
    this.queues.clear();
  }

  getQueue(queueName: string): Queue | undefined {
    return this.queues.get(queueName);
  }

  getWorker(queueName: string, jobName: string): Worker | undefined {
    return this.workers.get(`${queueName}:${jobName}`);
  }

  getAllQueues(): Map<string, Queue> {
    return this.queues;
  }

  getAllWorkers(): Map<string, Worker> {
    return this.workers;
  }
}
