import { z } from 'zod';

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const publicEnvSchema = baseSchema.extend({});

const booleanFlag = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1');

// Docker compose passes unset optional vars as empty strings; treat them as undefined.
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);
const optionalString = z.preprocess(emptyAsUndefined, z.string().optional());
const optionalUrl = z.preprocess(emptyAsUndefined, z.string().url().optional());

export const serverEnvSchema = baseSchema
  .extend({
    PORT: z.coerce.number().default(3001),
    DOMAIN: z.string().min(1),

    ENCRYPTION_SECRET: z.string().min(32),

    HUNTER_API_KEY: z.string().optional(),

    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.coerce.number().default(6379),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().default(0),

    // OIDC SSO (optional — same convention as Nuage/Courrier/Agenda)
    OIDC_ISSUER: optionalUrl,
    OIDC_CLIENT_ID: optionalString,
    OIDC_CLIENT_SECRET: optionalString,
    OIDC_REDIRECT_URL: optionalUrl,
    OIDC_SUCCESS_URL: optionalUrl,

    COURRIER_URL: optionalUrl,
    COURRIER_AUDIENCE: optionalString,
    BULLE_URL: optionalUrl,
    ARDOISE_URL: optionalUrl,
    ARDOISE_API_TOKEN: optionalString,
    ARDOISE_WEBHOOK_SECRET: z.preprocess(emptyAsUndefined, z.string().min(16).optional()),
    ARDOISE_DEFAULT_OWNER_EMAIL: z.preprocess(emptyAsUndefined, z.string().email().optional()),
    ARDOISE_WEB_URL: z.preprocess(emptyAsUndefined, z.string().url().default('https://ardoise.facile.studio')),
    MCP_CONFIRM_KEY: z.preprocess(emptyAsUndefined, z.string().min(32).optional()),
  })
  .superRefine((env, ctx) => {
    if (env.OIDC_ISSUER && (!env.OIDC_CLIENT_ID || !env.OIDC_CLIENT_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are required when OIDC_ISSUER is set',
      });
    }
    const ardoise = [
      env.ARDOISE_URL,
      env.ARDOISE_API_TOKEN,
      env.ARDOISE_WEBHOOK_SECRET,
      env.ARDOISE_DEFAULT_OWNER_EMAIL,
    ];
    if (ardoise.some(Boolean) && !ardoise.every(Boolean)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'ARDOISE_URL, ARDOISE_API_TOKEN, ARDOISE_WEBHOOK_SECRET and ARDOISE_DEFAULT_OWNER_EMAIL go together: set all four or none',
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;
