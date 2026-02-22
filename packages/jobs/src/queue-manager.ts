import { Queue, Worker, type Job as BullJob } from 'bullmq';
import type { JobConfig, JobDefinition, AddJobOptions } from './types';
import { logger } from '@repo/logger';

export class QueueManager {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private jobDefinitions: Map<string, Map<string, JobDefinition<any, any>>> = new Map();
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

  

  private getOrCreateWorker(queueName: string, definitionConcurrency?: number): Worker {
    

    if (!this.workers.has(queueName)) {
      const worker = new Worker(
        queueName,
        

        async (job: BullJob<any>) => {
          const definitions = this.jobDefinitions.get(queueName);
          

          if (!definitions) {
            throw new Error(`No job definitions registered for queue ${queueName}`);
          }

          const definition = definitions.get(job.name);
          

          if (!definition) {
            throw new Error(`No processor registered for job ${job.name} in queue ${queueName}`);
          }

          logger.debug(`[BullMQ] Processing: ${job.name} (${job.id})`);
          return await definition.processor(job);
        },
        {
          connection: this.config.connection,
          concurrency: definitionConcurrency ?? this.config.workerOptions?.concurrency ?? 10,
          lockDuration: this.config.workerOptions?.lockDuration,
          lockRenewTime: this.config.workerOptions?.lockRenewTime,
          stalledInterval: this.config.workerOptions?.stalledInterval,
          maxStalledCount: this.config.workerOptions?.maxStalledCount,
        }
      );

      worker.on('completed', (job) => {
        logger.debug(`[BullMQ] Completed: ${job.name} (${job.id})`);
      });

      worker.on('failed', (job, err) => {
        logger.error(`[BullMQ] Failed: ${job?.name} (${job?.id}) - ${err.message}`);
      });

      worker.on('stalled', (jobId) => {
        logger.warn(`[BullMQ] Stalled: job ${jobId}`);
      });

      worker.on('error', (err) => {
        logger.error(`[BullMQ] Worker error: ${err.message}`);
      });

      worker.on('active', (job) => {
        logger.debug(`[BullMQ] Active: ${job.name} (${job.id})`);
      });

      this.workers.set(queueName, worker);
    }

    return this.workers.get(queueName)!;
  }

  registerWorker<T = any, R = any>(
    queueName: string,
    definition: JobDefinition<T, R>
  ): Worker {
    

    if (!this.jobDefinitions.has(queueName)) {
      this.jobDefinitions.set(queueName, new Map());
    }

    const definitions = this.jobDefinitions.get(queueName)!;
    

    if (definitions.has(definition.name)) {
      throw new Error(`Job ${definition.name} already registered for queue ${queueName}`);
    }

    definitions.set(definition.name, definition);
    logger.debug(`[BullMQ] Registered: ${definition.name}`);

    return this.getOrCreateWorker(queueName, definition.options?.concurrency);
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
    logger.debug('[BullMQ] Closing all workers and queues');
    await Promise.all([
      ...Array.from(this.workers.values()).map((worker) => worker.close()),
      ...Array.from(this.queues.values()).map((queue) => queue.close()),
    ]);

    this.workers.clear();
    this.queues.clear();
    this.jobDefinitions.clear();
    logger.debug('[BullMQ] Closed');
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
