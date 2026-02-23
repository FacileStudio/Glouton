export { QueueManager } from './queue-manager';
export { JobScheduler } from './scheduler';
export {
  createJobConfig,
  parseRedisUrl,
  JobPriorities,
  CommonBackoffStrategies,
  validateRedisConfiguration,
} from './utils';
export { verifyEmail } from './services/email-verifier';
export type { EmailVerificationResult, VerificationReason } from './services/email-verifier';

export type {
  JobConfig,
  JobProcessor,
  JobDefinition,
  AddJobOptions,
  JobStatus,
  JobInfo,
  Queue,
  Worker,
  BullJob,
} from './types';
