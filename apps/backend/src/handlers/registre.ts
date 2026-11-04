import { Hono } from 'hono';
import { SyncPath } from '../services/registre-directory';

/**
 * Registre's empty nudge. It carries no data and no credentials, so it sits
 * outside tRPC and the plan gate: a nudge only schedules a pull, and the pull
 * is authenticated with Glouton's own client credentials.
 */
export function createRegistreSyncRoutes(syncer: { nudge(): void }) {
  const routes = new Hono();
  routes.post(SyncPath, (c) => {
    syncer.nudge();
    return c.body(null, 202);
  });
  return routes;
}
