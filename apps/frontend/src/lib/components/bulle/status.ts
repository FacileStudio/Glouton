import { trpc } from '$lib/trpc';
import type { Key } from '$lib/i18n/rows';

export type AssistantStatus = Awaited<ReturnType<typeof trpc.assistant.status.query>>;
export type AssistantReason = NonNullable<AssistantStatus['reason']>;

export type WriteAction = Parameters<typeof trpc.assistant.write.mutate>[0]['action'];
export type WriteResult = Awaited<ReturnType<typeof trpc.assistant.write.mutate>>;
export type NextAction = Awaited<ReturnType<typeof trpc.assistant.nextAction.mutate>>;
export type ApplyMode = 'replace' | 'insert';
export type BulleMood = 'idle' | 'thinking' | 'done' | 'unavailable';

export const BULLE_SETTINGS_URL = 'https://bulle.facile.studio';

const cache = new Map<string, Promise<AssistantStatus>>();

/** Loads Bulle's availability once per scope; a failed load is forgotten so the next panel retries. */
export function assistantStatus(teamId: string | undefined): Promise<AssistantStatus> {
  const key = teamId ?? '';
  let pending = cache.get(key);
  if (!pending) {
    pending = trpc.assistant.status.query({ teamId });
    pending.catch(() => cache.delete(key));
    cache.set(key, pending);
  }
  return pending;
}

export const REASONS: Record<Exclude<AssistantReason, 'plan_required'>, { title: Key; text: Key; link?: Key }> = {
  not_linked: { title: 'assistant.reason.not_linked.title', text: 'assistant.reason.not_linked.text' },
  no_key: { title: 'assistant.reason.no_key.title', text: 'assistant.reason.no_key.text', link: 'assistant.reason.no_key.link' },
  unreachable: { title: 'assistant.reason.unreachable.title', text: 'assistant.reason.unreachable.text' },
};
