import { publicEnvSchema } from '@repo/env';

const metaEnv = typeof import.meta.env !== 'undefined' ? import.meta.env : {};

export const env = publicEnvSchema.parse({
  API_URL: metaEnv.VITE_API_URL ?? process.env.VITE_API_URL,
  NODE_ENV: metaEnv.MODE ?? process.env.NODE_ENV,
});

export default env;
