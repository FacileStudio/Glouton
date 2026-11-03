import { Hono, type Context } from 'hono';
import { ardoise } from '@repo/trpc';

export const ARDOISE_ROUTES_PREFIX = '/api/integrations/ardoise';

function fail(c: Context, status: 400 | 401 | 404 | 500, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}

function parseEnvelope(raw: string): ardoise.ArdoiseEnvelope | null {
  try {
    const parsed = ardoise.envelopeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Receives Ardoise webhooks: checks the HMAC of the raw body, drops a
 * delivery id already seen (Ardoise retries reuse it), then applies the event.
 * A failure releases the id so the next retry is processed again.
 */
export function createArdoiseRoutes(deps: ardoise.InboundDeps) {
  const routes = new Hono();

  routes.post('/webhook', async (c) => {
    const config = deps.config;
    if (!config) {
      ardoise.warnArdoiseOff(deps.log);
      return fail(c, 404, 'not_configured', 'Ardoise sync is not configured');
    }
    const raw = await c.req.text();
    if (!ardoise.verifySignature(config.webhookSecret, raw, c.req.header(ardoise.SIGNATURE_HEADER))) {
      return fail(c, 401, 'invalid_signature', 'Signature does not match');
    }
    const envelope = parseEnvelope(raw);
    if (!envelope) return fail(c, 400, 'invalid_payload', 'Body is not an Ardoise event');
    const deliveryId = c.req.header(ardoise.DELIVERY_HEADER) ?? envelope.id;

    if (!(await ardoise.claimDelivery(deps.prisma, deliveryId, envelope.event))) {
      return c.json({ data: { outcome: 'duplicate' } });
    }
    try {
      const outcome = await ardoise.handleArdoiseEvent(deps, envelope);
      deps.log.info({ type: 'ardoise-webhook', deliveryId, event: envelope.event, outcome }, 'Ardoise event handled');
      return c.json({ data: { outcome } }, 202);
    } catch (error) {
      await ardoise.releaseDelivery(deps.prisma, deliveryId);
      deps.log.error({ type: 'ardoise-webhook', deliveryId, event: envelope.event, error }, 'Ardoise event failed');
      return fail(c, 500, 'internal', 'Could not apply the event');
    }
  });

  return routes;
}
