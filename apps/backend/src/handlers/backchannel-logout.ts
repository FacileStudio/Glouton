import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { logger } from '@repo/logger';
import { BackchannelLogoutPath, LogoutTokenError } from '../services/backchannel-logout';

export interface BackchannelLogoutDeps {
  verify: (token: string) => Promise<string>;
  revoke: (sub: string) => Promise<string[]>;
}

const maxBody = 16 << 10;

/**
 * Registre's back-channel logout receiver (OpenID Connect Back-Channel Logout
 * 1.0). A form POST carrying `logout_token`: 200 once every session of that
 * person is revoked, 400 when the token is missing or invalid, 500 when
 * Glouton could not check or apply it. Every answer is `Cache-Control: no-store`.
 */
export function createBackchannelLogoutRoutes(deps: BackchannelLogoutDeps) {
  const routes = new Hono();
  routes.use(BackchannelLogoutPath, async (c, next) => {
    await next();
    c.res.headers.set('Cache-Control', 'no-store');
  });
  routes.post(
    BackchannelLogoutPath,
    bodyLimit({ maxSize: maxBody, onError: (c) => c.json({ error: 'invalid_request' }, 400) }),
    async (c) => {
      const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
      const token = body.logout_token;
      if (typeof token !== 'string' || token === '') return c.json({ error: 'invalid_request' }, 400);
      try {
        const sub = await deps.verify(token);
        const userIds = await deps.revoke(sub);
        logger.info({ users: userIds.length }, '[OIDC] Back-channel logout applied');
        return c.body(null, 200);
      } catch (error) {
        if (error instanceof LogoutTokenError) {
          logger.warn({ reason: error.message }, '[OIDC] Back-channel logout token refused');
          return c.json({ error: 'invalid_request' }, 400);
        }
        logger.error({ err: error }, '[OIDC] Back-channel logout failed');
        return c.json({ error: 'server_error' }, 500);
      }
    }
  );
  return routes;
}
