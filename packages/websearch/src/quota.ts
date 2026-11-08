import { WebSearchError, type KeyValueStore, type QuotaLimits, type Usage } from './types';

export const DEFAULT_LIMITS: QuotaLimits = { searches: 50, fetches: 200 };

const DAY_SECONDS = 2 * 24 * 3600;

type Kind = keyof QuotaLimits;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value && Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Reads WEBSEARCH_DAILY_QUOTA (searches per team per day) and
 * WEBSEARCH_DAILY_FETCH_QUOTA (page fetches per team per day).
 */
export function limitsFromEnv(env: Record<string, string | undefined> = process.env): QuotaLimits {
  return {
    searches: positiveInt(env.WEBSEARCH_DAILY_QUOTA, DEFAULT_LIMITS.searches),
    fetches: positiveInt(env.WEBSEARCH_DAILY_FETCH_QUOTA, DEFAULT_LIMITS.fetches),
  };
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export class DailyQuota {
  constructor(
    private readonly store: KeyValueStore,
    readonly limits: QuotaLimits,
    private readonly now: () => Date = () => new Date()
  ) {}

  private key(teamId: string, kind: Kind): string {
    return `websearch:quota:${teamId}:${kind}:${dayKey(this.now())}`;
  }

  async reserve(teamId: string, kind: Kind, cost: number): Promise<() => Promise<void>> {
    const key = this.key(teamId, kind);
    const used = await this.store.incrby(key, cost);
    await this.store.expire(key, DAY_SECONDS);
    if (used > this.limits[kind]) {
      await this.store.decrby(key, cost);
      throw new WebSearchError('quota_exceeded', `daily ${kind} quota of ${this.limits[kind]} reached`);
    }
    return async () => {
      await this.store.decrby(key, cost);
    };
  }

  async usage(teamId: string): Promise<Usage> {
    const [searches, fetches] = await Promise.all([
      this.store.get(this.key(teamId, 'searches')),
      this.store.get(this.key(teamId, 'fetches')),
    ]);
    return { searches: Number(searches ?? 0), fetches: Number(fetches ?? 0), limits: this.limits };
  }
}
