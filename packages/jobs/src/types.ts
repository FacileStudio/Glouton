import type { Job as BullJob, JobsOptions, Queue, Worker } from 'bullmq';

export interface JobConfig {
  connection: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    maxRetriesPerRequest?: number | null;
  };
  defaultJobOptions?: JobsOptions;
  workerOptions?: {
    lockDuration?: number;
    lockRenewTime?: number;
    stalledInterval?: number;
    maxStalledCount?: number;
    concurrency?: number;
  };
}

export interface JobProcessor<T = any, R = any> {
  (job: BullJob<T>): Promise<R>;
}

export interface JobDefinition<T = any, R = any> {
  name: string;
  processor: JobProcessor<T, R>;
  options?: {
    concurrency?: number;
    limiter?: {
      max: number;
      duration: number;
    };
  };
}

export interface AddJobOptions extends JobsOptions {
  priority?: number;
  delay?: number;
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
  attempts?: number;
  backoff?: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
}

export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';

export interface JobInfo {
  id: string;
  name: string;
  data: any;
  progress: number;
  attemptsMade: number;
  failedReason?: string;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}

export type { Queue, Worker, BullJob };
