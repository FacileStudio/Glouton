import type { JobConfig } from './types';

export function createJobConfig(options?: {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
}): JobConfig {
  return {
    connection: {
      host: options?.host ?? 'localhost',
      port: options?.port ?? 6379,
      password: options?.password,
      db: options?.db ?? 0,
    },
    defaultJobOptions: {
      removeOnComplete: {
        age: 24 * 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600,
      },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  };
}

export function parseRedisUrl(url: string): JobConfig['connection'] {
  try {
    const parsed = new URL(url);

    return {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 6379,
      password: parsed.password || undefined,
      db: parsed.pathname ? parseInt(parsed.pathname.slice(1)) : 0,
    };
  } catch {
    throw new Error('Invalid Redis URL format. Expected: redis://[:password@]host[:port][/db]');
  }
}

export const JobPriorities = {
  CRITICAL: 1,
  HIGH: 5,
  NORMAL: 10,
  LOW: 15,
  VERY_LOW: 20,
} as const;

export const CommonBackoffStrategies = {
  exponential: (attemptsMade: number) => ({
    type: 'exponential' as const,
    delay: Math.min(1000 * Math.pow(2, attemptsMade), 60000),
  }),
  fixed: (delay: number = 5000) => ({
    type: 'fixed' as const,
    delay,
  }),
  linear: (attemptsMade: number, baseDelay: number = 1000) => ({
    type: 'fixed' as const,
    delay: Math.min(baseDelay * (attemptsMade + 1), 60000),
  }),
};
