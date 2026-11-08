import { prisma } from '@repo/database';
import { logger } from '@repo/logger';
import { dispatchWebhookEvent } from '@repo/webhooks';
import { createWebSearch, type KeyValueStore, type WebSearch } from '@repo/websearch';
import Redis from 'ioredis';
import { allowEveryScope, type JobConfig, type JobDefinition, type ScopeGate } from '../../types';
import type { EventEmitter } from '../index';
import { runWatch, type Digest, type WatchScope } from './run';

export { normalizeText, hashText, stripTracking, MAX_TEXT_LENGTH } from './normalize';
export { diffText, type DiffLine, type TextDiff } from './diff';
export { parseRobots, isAllowed, loadRobots, ALLOW_ALL, ROBOT_TOKEN, type RobotsPolicy } from './robots';
export { recordFetch, prune } from './record';
export {
  runWatch,
  interleaveByHost,
  quotaKey,
  SNAPSHOTS_KEPT,
  CHANGES_KEPT,
  RECHECK_AFTER_MS,
  DOMAIN_INTERVAL_MS,
  type CheckStatus,
  type Digest,
  type DigestItem,
  type WatchDeps,
  type WatchResult,
  type WatchScope,
} from './run';

export const COMPETITOR_WATCH = 'competitor-watch';

/** A websearch client whose cache and quota live in the jobs Redis. */
export function redisWebSearch(connection: JobConfig['connection']): WebSearch {
  const store = new Redis({ ...connection, lazyConnect: true });
  return createWebSearch({ store: store as unknown as KeyValueStore });
}

/** The in-app event a scope receives with its daily digest. */
export const DIGEST_EVENT = 'competitor-watch:digest';

/** Writes or reads the AI summary of each change of a scope's digest, keyed by change id; an empty map leaves the digest as is. */
export type DigestSummarizer = (scope: WatchScope, changeIds: string[]) => Promise<Map<string, string>>;

/**
 * Sends one digest in the app and, for a team, to its webhooks (Antenne)
 * subscribed to `competitor.changes`. With a summarizer, each item carries
 * its AI summary when one exists.
 */
export function digestSender(events?: EventEmitter, summarize?: DigestSummarizer) {
  return async (digest: Digest): Promise<void> => {
    const { scope, quotaSkipped } = digest;
    const summaries = summarize ? await summarize(scope, digest.items.map((item) => item.changeId)) : new Map<string, string>();
    const items = digest.items.map((item) => ({ ...item, summary: summaries.get(item.changeId) ?? null }));
    const data = { count: items.length, quotaSkipped, items };
    const target = scope.teamId
      ? { type: 'team' as const, userId: scope.userId, teamId: scope.teamId }
      : { type: 'personal' as const, userId: scope.userId };
    await events?.emitToScope(target, DIGEST_EVENT, data).catch((error: unknown) =>
      logger.error({ err: error }, '[WATCH] Could not send the in-app digest')
    );
    if (scope.teamId) await dispatchWebhookEvent({ event: 'competitor.changes', teamId: scope.teamId, data });
  };
}

/** Daily: checks every watched competitor page and sends one digest per scope. Inert without websearch. */
export function createCompetitorWatchWorker(
  web: WebSearch | null,
  events?: EventEmitter,
  allowed: ScopeGate = allowEveryScope,
  summarize?: DigestSummarizer
): JobDefinition<object, void> {
  return {
    name: COMPETITOR_WATCH,
    processor: async () => {
      if (!web) return;
      try {
        const result = await runWatch({ prisma, web, allowed, sendDigest: digestSender(events, summarize) });
        logger.info(result, '[WATCH] Competitor pages checked');
      } catch (error) {
        logger.error({ err: error }, '[WATCH] Competitor page check failed');
      }
    },
    options: { concurrency: 1 },
  };
}
