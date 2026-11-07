import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { logger } from '@repo/logger';
import type { AuthManager } from '@repo/auth';
import {
  STATE_COOKIE,
  STATE_TTL_SECONDS,
  oidcEnabled,
  startLogin,
  openState,
  exchangeCode,
  loginWithOidc,
  oidcSuccessUrl,
  ssoFailureUrl,
} from '../services/oidc';

const STATE_COOKIE_PATH = '/auth/oidc';

export function createAuthRoutes(authManager: AuthManager) {
  const routes = new Hono();

  routes.get('/config', (c) => c.json({ oidc_enabled: oidcEnabled }));

  routes.get('/oidc', async (c) => {
    if (!oidcEnabled) return c.json({ error: 'Sign-in is not configured' }, 503);
    try {
      const login = await startLogin();
      setCookie(c, STATE_COOKIE, login.cookie, {
        path: STATE_COOKIE_PATH,
        maxAge: STATE_TTL_SECONDS,
        httpOnly: true,
        sameSite: 'Lax',
        secure: new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https',
      });
      return c.redirect(login.url);
    } catch (error) {
      logger.error({ error }, '[OIDC] Failed to start login');
      return c.json({ error: 'OIDC login unavailable' }, 502);
    }
  });

  routes.get('/oidc/callback', async (c) => {
    if (!oidcEnabled) return c.json({ error: 'Sign-in is not configured' }, 503);
    const state = c.req.query('state');
    const code = c.req.query('code');
    const cookie = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: STATE_COOKIE_PATH });

    const saved = cookie ? await openState(cookie) : null;
    if (!state || !saved || state !== saved.state) {
      return c.json({ error: 'Invalid OAuth2 state' }, 400);
    }
    if (!code) {
      return c.json({ error: 'Missing authorization code' }, 400);
    }

    try {
      const claims = await exchangeCode(code, saved);
      const { token } = await loginWithOidc(authManager, claims);
      return c.redirect(`${oidcSuccessUrl}#token=${encodeURIComponent(token)}`);
    } catch (error) {
      logger.error({ err: error }, '[OIDC] Callback failed');
      return c.redirect(ssoFailureUrl(error));
    }
  });

  return routes;
}

export default createAuthRoutes;
