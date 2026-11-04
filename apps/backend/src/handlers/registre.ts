import { Hono, type MiddlewareHandler } from 'hono';
import { SyncPath } from '../services/registre-directory';
import { nudgeLimiter } from '../middleware/rate-limit';

/**
 * Registre's empty nudge. It carries no data and no credentials, so it sits
 * outside tRPC and the plan gate: a nudge only schedules a pull, and the pull
 * is authenticated with Glouton's own client credentials. Each IP is rate
 * limited so the route cannot be used to hammer Registre.
 */
export function createRegistreSyncRoutes(syncer: { nudge(): void }, limiter: MiddlewareHandler = nudgeLimiter) {
  const routes = new Hono();
  routes.post(SyncPath, limiter, (c) => {
    syncer.nudge();
    return c.body(null, 202);
  });
  return routes;
}
