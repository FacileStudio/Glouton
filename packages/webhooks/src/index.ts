import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { prisma } from '@repo/database';
import {
  checkPublicUrl,
  resolvePublicAddress,
  systemResolver,
  type ResolvedAddress,
  type Resolver,
} from '@repo/websearch';

/**
 * Catalog of events a team can subscribe to. Keys are stored in
 * TeamWebhook.events; labels are shown in the settings UI.
 */
export const WEBHOOK_EVENTS = {
  'opportunity.new': 'Nouvelles missions freelance',
  'hunt.completed': 'Chasse terminée',
  'hunt.failed': 'Chasse échouée',
  'hunt.digest': 'Nouveaux prospects d\'une chasse automatique',
  'hunt.schedule_paused': 'Chasse automatique mise en pause',
  'audit.completed': 'Audit de site terminé',
  'competitor.changes': 'Veille concurrents : changements du jour',
  'competitor.new_registered': 'Nouvelle entreprise concurrente immatriculée (BODACC)',
  'team.member_added': 'Membre ajouté à l\'équipe',
  'team.member_removed': 'Membre retiré de l\'équipe',
} as const;

export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;

export const WEBHOOK_EVENT_KEYS = Object.keys(WEBHOOK_EVENTS) as WebhookEvent[];

export interface WebhookPayload {
  app: string;
  event: WebhookEvent | 'webhook.test';
  timestamp: string;
  team: { id: string; name: string };
  data: Record<string, unknown>;
}

const APP_NAME = 'glouton';
const SEND_TIMEOUT_MS = 10_000;

/**
 * Send an event to every enabled webhook subscribed to it.
 *
 * - `teamId` given: only that team's webhooks (team-scoped events).
 * - `teamId` omitted: webhooks of every team (global events such as
 *   new freelance missions).
 *
 * Fire-and-forget by design: failures are logged, never thrown, so a dead
 * Nook endpoint can never break a worker or a tRPC mutation.
 */
export async function dispatchWebhookEvent(options: {
  event: WebhookEvent;
  data: Record<string, unknown>;
  teamId?: string | null;
}): Promise<void> {
  const { event, data, teamId } = options;

  try {
    const webhooks = await prisma.teamWebhook.findMany({
      where: {
        enabled: true,
        events: { has: event },
        ...(teamId ? { teamId } : {}),
      },
      include: { team: { select: { id: true, name: true } } },
    });

    if (webhooks.length === 0) return;

    const results = await Promise.allSettled(
      webhooks.map((webhook) =>
        sendWebhook(webhook.url, {
          app: APP_NAME,
          event,
          timestamp: new Date().toISOString(),
          team: { id: webhook.team.id, name: webhook.team.name },
          data,
        })
      )
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`[Webhooks] ${event} to webhook ${webhooks[index].id} failed:`, result.reason?.message);
      }
    });
  } catch (err: any) {
    console.error(`[Webhooks] Dispatch failed for ${event}:`, err?.message);
  }
}

/**
 * Network seam for webhook delivery. Production uses the system resolver and
 * a pinned node:http(s) request; tests swap these to observe deliveries
 * without opening the guard.
 */
export const webhookTransport: { resolve: Resolver; post: typeof postPinned } = {
  resolve: systemResolver,
  post: postPinned,
};

/**
 * Checks a webhook URL the way a delivery will: the shared public-URL guard,
 * then a DNS resolution where every address must be public. Returns the
 * parsed URL and the checked address to connect to.
 */
export async function checkWebhookUrl(url: string): Promise<{ target: URL; address: ResolvedAddress }> {
  const target = checkPublicUrl(url);
  const address = await resolvePublicAddress(target.hostname, webhookTransport.resolve);
  return { target, address };
}

/**
 * POST a payload to a webhook URL. Used by the dispatcher and by the
 * "send a test" action in team settings (which is allowed to throw so the
 * UI can show the failure).
 *
 * The URL is checked with `checkWebhookUrl` at every delivery and the
 * connection is pinned to the checked address, so a DNS rebind cannot send
 * it elsewhere. Redirects are never followed.
 */
export async function sendWebhook(url: string, payload: WebhookPayload): Promise<void> {
  const { target, address } = await checkWebhookUrl(url);
  const status = await webhookTransport.post(target, address, JSON.stringify(payload), {
    'Content-Type': 'application/json',
    'User-Agent': `${APP_NAME}-webhooks/1.0`,
    'X-Webhook-Event': payload.event,
  });
  if (status >= 300 && status < 400) throw new Error(`redirects are not followed (HTTP ${status})`);
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
}

/**
 * POSTs a body to `target` over a socket opened to `address` only. The Host
 * header and TLS server name stay the URL's hostname. Resolves with the
 * response status; never follows redirects.
 */
export function postPinned(
  target: URL,
  address: ResolvedAddress,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number = SEND_TIMEOUT_MS
): Promise<number> {
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (options?.all) {
      (callback as unknown as (err: null, list: ResolvedAddress[]) => void)(null, [address]);
    } else {
      callback(null, address.address, address.family);
    }
  };
  const requestOptions: RequestOptions = {
    method: 'POST',
    protocol: target.protocol,
    hostname: target.hostname.replace(/^\[|\]$/g, ''),
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: `${target.pathname}${target.search}`,
    headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
    lookup,
  };
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = send(requestOptions, (res: IncomingMessage) => {
      clearTimeout(timer);
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    const timer = setTimeout(() => req.destroy(new Error('timeout')), timeoutMs);
    req.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    req.end(body);
  });
}
