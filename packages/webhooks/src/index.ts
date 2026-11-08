import { prisma } from '@repo/database';

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

    await Promise.allSettled(
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
  } catch (err: any) {
    console.error(`[Webhooks] Dispatch failed for ${event}:`, err?.message);
  }
}

/**
 * POST a payload to a webhook URL. Used by the dispatcher and by the
 * "send a test" action in team settings (which is allowed to throw so the
 * UI can show the failure).
 */
export async function sendWebhook(url: string, payload: WebhookPayload): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `${APP_NAME}-webhooks/1.0`,
        'X-Webhook-Event': payload.event,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
