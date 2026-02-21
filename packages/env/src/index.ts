import { z } from 'zod';

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const publicEnvSchema = baseSchema.extend({
  API_URL: z.string().url(),
});

export const serverEnvSchema = baseSchema.extend({
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().url(),
  TRUSTED_ORIGINS: z.string().transform((s) => s.split(',').map((u) => u.trim())),

  ENCRYPTION_SECRET: z.string().min(1),

  HUNTER_API_KEY: z.string().optional(),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  LOGTAIL_TOKEN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;
