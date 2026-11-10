import type { RouterInputs, RouterOutputs } from '@repo/trpc-client';
import type { Key } from '$lib/i18n/rows';

export type SuggestionList = RouterOutputs['competitorDiscovery']['list'];
export type Suggestion = SuggestionList['items'][number];
export type SuggestionSource = Suggestion['source'];

/** The score thresholds "accept all above" offers. */
export const MIN_SCORES = [50, 60, 70, 80] as const;

/** The label key of a source. */
export function sourceLabel(source: SuggestionSource): Key {
  return `discovery.source.${source}`;
}

/** The badge tone of a score: strong, middling, weak. */
export function scoreTone(score: number): 'success' | 'warning' | 'neutral' {
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'neutral';
}

/** A domain or website without the scheme and trailing slash. */
export function hostOf(url: string | null): string {
  return (url ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export type WebhookEvent = RouterInputs['team']['createWebhook']['events'][number];

/** Every webhook event a team can subscribe to, with its label, in the order the form lists them. */
export const WEBHOOK_EVENTS = {
  'competitor.new_registered': 'webhooks.event.competitor.new_registered',
  'competitor.changes': 'webhooks.event.competitor.changes',
  'job.offers_found': 'webhooks.event.job.offers_found',
  'hunt.digest': 'webhooks.event.hunt.digest',
  'hunt.schedule_paused': 'webhooks.event.hunt.schedule_paused',
  'hunt.completed': 'webhooks.event.hunt.completed',
  'hunt.failed': 'webhooks.event.hunt.failed',
  'audit.completed': 'webhooks.event.audit.completed',
  'opportunity.new': 'webhooks.event.opportunity.new',
  'team.member_added': 'webhooks.event.team.member_added',
  'team.member_removed': 'webhooks.event.team.member_removed',
} as const satisfies Record<WebhookEvent, Key>;

export const WEBHOOK_EVENT_KEYS = Object.keys(WEBHOOK_EVENTS) as WebhookEvent[];

/** The label key of a stored event name; unknown names have none. */
export function webhookEventLabel(event: string): Key | null {
  return (WEBHOOK_EVENTS as Record<string, Key>)[event] ?? null;
}
