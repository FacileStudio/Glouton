import { publicEnvSchema } from '@repo/env';

export const env = publicEnvSchema.parse({
  NODE_ENV: import.meta.env?.MODE ?? process.env.NODE_ENV ?? 'development',
});

export default env;
