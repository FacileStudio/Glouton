import { Context } from 'hono';
import { openApiDocument } from '@repo/trpc';

export const openApiHandler = (c: Context): Response => {
  return c.json(openApiDocument);
};
