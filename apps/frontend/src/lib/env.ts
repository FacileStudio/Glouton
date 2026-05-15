import { publicEnvSchema } from '@repo/env';

const metaEnv = typeof import.meta.env !== 'undefined' ? import.meta.env : {};

export const env = publicEnvSchema.parse({
  NODE_ENV: metaEnv.MODE ?? process.env.NODE_ENV ?? 'development',
});

export default env;
