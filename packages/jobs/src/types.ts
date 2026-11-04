import type { Job as BullJob, JobsOptions, KeepJobs, Queue, Worker } from 'bullmq';

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

/**
 * Says whether a scope may run Glouton work now (its plan has
 * `glouton.access`). Jobs of a scope without it are skipped and logged.
 */
export type ScopeGate = (scope: { userId: string; teamId: string | null }) => Promise<boolean>;

/** The gate used when none is given: every scope runs. */
export const allowEveryScope: ScopeGate = async () => true;

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
  removeOnComplete?: boolean | number | KeepJobs;
  removeOnFail?: boolean | number | KeepJobs;
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
