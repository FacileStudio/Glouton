import { createHash } from 'node:crypto';
import { cleanCount, cleanEngines, cleanQuery, cleanSelector, cleanUrls } from './input';
import { DailyQuota, limitsFromEnv } from './quota';
import { parseFetchOutput, parseSearchOutput, runSonar } from './runner';
import {
  WebSearchError,
  type FetchedPage,
  type FetchOptions,
  type KeyValueStore,
  type QuotaLimits,
  type RunnerConfig,
  type SearchOptions,
  type SearchResult,
  type Usage,
} from './types';

export interface WebSearchConfig {
  store: KeyValueStore;
  bin?: string;
  env?: Record<string, string | undefined>;
  limits?: QuotaLimits;
  searchTimeoutMs?: number;
  fetchTimeoutMs?: number;
  maxOutputBytes?: number;
  searchTtlSeconds?: number;
  fetchTtlSeconds?: number;
  now?: () => Date;
}

export interface WebSearch {
  search(teamId: string, query: string, options?: SearchOptions): Promise<SearchResult[]>;
  fetch(teamId: string, urls: string[], options?: FetchOptions): Promise<FetchedPage[]>;
  usage(teamId: string): Promise<Usage>;
}

const HOUR = 3600;

function cacheKey(kind: string, parts: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `websearch:cache:${kind}:${digest}`;
}

function requireTeam(teamId: string): void {
  if (!teamId) throw new WebSearchError('invalid_input', 'teamId is required');
}

/**
 * Builds a sonar client. Results are cached in the shared store (so every
 * worker sees them) and each team has a daily search and fetch quota. A cache
 * hit costs no quota, and a failed run gives its quota back.
 */
export function createWebSearch(config: WebSearchConfig): WebSearch {
  const { store } = config;
  const quota = new DailyQuota(store, config.limits ?? limitsFromEnv(), config.now);
  const runner: RunnerConfig = {
    bin: config.bin ?? 'sonar',
    env: config.env ?? process.env,
    timeoutMs: config.searchTimeoutMs ?? 30_000,
    maxOutputBytes: config.maxOutputBytes ?? 2 * 1024 * 1024,
  };
  const searchTtl = config.searchTtlSeconds ?? HOUR;
  const fetchTtl = config.fetchTtlSeconds ?? 6 * HOUR;
  const fetchTimeout = config.fetchTimeoutMs ?? 90_000;

  async function readCache<T>(key: string): Promise<T | null> {
    const raw = await store.get(key).catch(() => null);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async function writeCache(key: string, value: unknown, ttl: number): Promise<void> {
    await store.set(key, JSON.stringify(value), 'EX', ttl).catch(() => undefined);
  }

  return {
    async search(teamId, rawQuery, options = {}) {
      requireTeam(teamId);
      const query = cleanQuery(rawQuery);
      const count = cleanCount(options.count);
      const engines = cleanEngines(options.engines);
      const key = cacheKey('search', { query, count, engines });
      const cached = await readCache<SearchResult[]>(key);
      if (cached) return cached;

      const release = await quota.reserve(teamId, 'searches', 1);
      try {
        const args = ['search', '--json'];
        if (count) args.push('-n', String(count));
        if (engines) args.push('--engines', engines.join(','));
        args.push('--', query);
        const results = parseSearchOutput(await runSonar(runner, args, options.timeoutMs));
        await writeCache(key, results, searchTtl);
        return results;
      } catch (error) {
        await release().catch(() => undefined);
        throw error;
      }
    },

    async fetch(teamId, rawUrls, options = {}) {
      requireTeam(teamId);
      const urls = cleanUrls(rawUrls);
      const selector = cleanSelector(options.selector);
      const browser = options.browser === true;
      const key = cacheKey('fetch', { urls, selector, browser });
      const cached = await readCache<FetchedPage[]>(key);
      if (cached) return cached;

      const release = await quota.reserve(teamId, 'fetches', urls.length);
      try {
        const timeoutMs = options.timeoutMs ?? fetchTimeout;
        const args = ['fetch', '--timeout', `${Math.max(1, Math.floor(timeoutMs / 1000) - 5)}s`];
        if (selector) args.push('--selector', selector);
        if (browser) args.push('--browser');
        args.push('--', ...urls);
        const pages = parseFetchOutput(await runSonar(runner, args, timeoutMs), urls);
        await writeCache(key, pages, fetchTtl);
        return pages;
      } catch (error) {
        await release().catch(() => undefined);
        throw error;
      }
    },

    usage(teamId) {
      requireTeam(teamId);
      return quota.usage(teamId);
    },
  };
}
