import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { logger } from '@repo/logger';
import type { AuthManager } from '@repo/auth';
import {
  oidcEnabled,
  ssoOnly,
  generateState,
  buildAuthorizationUrl,
  exchangeCode,
  loginWithOidc,
  oidcSuccessUrl,
} from '../services/oidc';

const OIDC_STATE_COOKIE = 'oidc_state';
const OIDC_STATE_TTL_SECONDS = 10 * 60;

export function createAuthRoutes(authManager: AuthManager) {
  const routes = new Hono();

  routes.get('/config', (c) =>
    c.json({
      sso_only: ssoOnly,
      oidc_enabled: oidcEnabled,
    })
  );

  if (!oidcEnabled) return routes;

  routes.get('/oidc', async (c) => {
    try {
      const state = generateState();
      setCookie(c, OIDC_STATE_COOKIE, state, {
        path: '/',
        maxAge: OIDC_STATE_TTL_SECONDS,
        httpOnly: true,
        sameSite: 'Lax',
        secure: new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https',
      });
      return c.redirect(await buildAuthorizationUrl(state));
    } catch (error) {
      logger.error({ error }, '[OIDC] Failed to start login');
      return c.json({ error: 'OIDC login unavailable' }, 502);
    }
  });

  routes.get('/oidc/callback', async (c) => {
    const state = c.req.query('state');
    const code = c.req.query('code');
    const stateCookie = getCookie(c, OIDC_STATE_COOKIE);
    deleteCookie(c, OIDC_STATE_COOKIE, { path: '/' });

    if (!state || !stateCookie || state !== stateCookie) {
      return c.json({ error: 'Invalid OAuth2 state' }, 400);
    }
    if (!code) {
      return c.json({ error: 'Missing authorization code' }, 400);
    }

    try {
      const claims = await exchangeCode(code);
      const { token } = await loginWithOidc(authManager, claims);
      // Hand the JWT to the SPA via the URL fragment (never sent to servers/logs).
      return c.redirect(`${oidcSuccessUrl}#token=${encodeURIComponent(token)}`);
    } catch (error) {
      logger.error({ error }, '[OIDC] Callback failed');
      return c.json({ error: 'OIDC authentication failed' }, 401);
    }
  });

  return routes;
}

export default createAuthRoutes;
