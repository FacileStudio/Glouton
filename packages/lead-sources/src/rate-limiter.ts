import type { LeadSource } from './types';

export interface SourceLimits {
  requestsPerMonth: number;
  requestsPerMinute?: number;
  requestsPerDay?: number;
  creditsPerRequest?: number;
  totalCredits?: number;
}

export interface RateLimitStatus {
  source: LeadSource;
  requestsUsed: number;
  requestsRemaining: number;
  creditsUsed?: number;
  creditsRemaining?: number;
  resetAt: Date;
  canMakeRequest: boolean;
  estimatedCost?: number;
}

interface UsageRecord {
  timestamps: number[];
  creditsUsed: number;
  resetAt: number;
}

const FREE_TIER_LIMITS: Record<LeadSource, SourceLimits> = {
  HUNTER: {
    requestsPerMonth: 25,
    requestsPerMinute: 15,
    creditsPerRequest: 1,
    totalCredits: 25,
  },
  APOLLO: {
    requestsPerMonth: 100,
    creditsPerRequest: 1,
    totalCredits: 100,
  },
  SNOV: {
    requestsPerMonth: 50,
    requestsPerMinute: 60,
    creditsPerRequest: 1,
    totalCredits: 50,
  },
  HASDATA: {
    requestsPerMonth: 50,
    creditsPerRequest: 1,
    totalCredits: 50,
  },
  CONTACTOUT: {
    requestsPerMonth: 100,
    creditsPerRequest: 1,
    totalCredits: 100,
  },
  MANUAL: {
    requestsPerMonth: Number.MAX_SAFE_INTEGER,
  },
};

export class RateLimiter {
  private usage: Map<LeadSource, UsageRecord> = new Map();
  private limits: Map<LeadSource, SourceLimits> = new Map();

  /**
   * constructor
   */
  constructor(customLimits?: Partial<Record<LeadSource, SourceLimits>>) {
    /**
     * for
     */
    for (const [source, defaultLimit] of Object.entries(FREE_TIER_LIMITS)) {
      this.limits.set(source as LeadSource, {
        ...defaultLimit,
        ...(customLimits?.[source as LeadSource] || {}),
      });
    }
  }

  /**
   * getOrCreateUsageRecord
   */
  private getOrCreateUsageRecord(source: LeadSource): UsageRecord {
    /**
     * if
     */
    if (!this.usage.has(source)) {
      this.usage.set(source, {
        timestamps: [],
        creditsUsed: 0,
        resetAt: this.getNextResetTime(),
      });
    }
    return this.usage.get(source)!;
  }

  /**
   * getNextResetTime
   */
  private getNextResetTime(): number {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.getTime();
  }

  /**
   * cleanOldTimestamps
   */
  private cleanOldTimestamps(record: UsageRecord, windowMs: number): void {
    const cutoff = Date.now() - windowMs;
    record.timestamps = record.timestamps.filter((ts) => ts > cutoff);
  }

  /**
   * resetIfNeeded
   */
  private resetIfNeeded(source: LeadSource, record: UsageRecord): void {
    /**
     * if
     */
    if (Date.now() >= record.resetAt) {
      record.timestamps = [];
      record.creditsUsed = 0;
      record.resetAt = this.getNextResetTime();
    }
  }

  /**
   * getStatus
   */
  getStatus(source: LeadSource): RateLimitStatus {
    const limits = this.limits.get(source)!;
    const record = this.getOrCreateUsageRecord(source);

    this.resetIfNeeded(source, record);

    const monthlyUsed = record.timestamps.length;
    const monthlyRemaining = Math.max(0, limits.requestsPerMonth - monthlyUsed);

    let canMakeRequest = monthlyRemaining > 0;

    /**
     * if
     */
    if (limits.requestsPerMinute) {
      this.cleanOldTimestamps(record, 60 * 1000);
      const minuteUsed = record.timestamps.filter((ts) => ts > Date.now() - 60 * 1000).length;
      canMakeRequest = canMakeRequest && minuteUsed < limits.requestsPerMinute;
    }

    /**
     * if
     */
    if (limits.requestsPerDay) {
      const dayUsed = record.timestamps.filter((ts) => ts > Date.now() - 24 * 60 * 60 * 1000)
        .length;
      canMakeRequest = canMakeRequest && dayUsed < limits.requestsPerDay;
    }

    /**
     * if
     */
    if (limits.totalCredits && limits.creditsPerRequest) {
      const creditsRemaining = limits.totalCredits - record.creditsUsed;
      canMakeRequest = canMakeRequest && creditsRemaining >= limits.creditsPerRequest;
    }

    return {
      source,
      requestsUsed: monthlyUsed,
      requestsRemaining: monthlyRemaining,
      creditsUsed: record.creditsUsed,
      creditsRemaining: limits.totalCredits ? limits.totalCredits - record.creditsUsed : undefined,
      resetAt: new Date(record.resetAt),
      canMakeRequest,
      estimatedCost: limits.creditsPerRequest,
    };
  }

  /**
   * checkAndConsume
   */
  async checkAndConsume(source: LeadSource, credits: number = 1): Promise<boolean> {
    const status = this.getStatus(source);

    /**
     * if
     */
    if (!status.canMakeRequest) {
      return false;
    }

    const record = this.getOrCreateUsageRecord(source);
    const limits = this.limits.get(source)!;

    /**
     * if
     */
    if (limits.totalCredits && record.creditsUsed + credits > limits.totalCredits) {
      return false;
    }

    record.timestamps.push(Date.now());
    record.creditsUsed += credits;

    return true;
  }

  /**
   * getAllStatuses
   */
  getAllStatuses(): RateLimitStatus[] {
    const sources: LeadSource[] = ['HUNTER', 'APOLLO', 'SNOV', 'HASDATA', 'CONTACTOUT'];
    return sources.map((source) => this.getStatus(source));
  }

  /**
   * getBestSource
   */
  getBestSource(requiredCredits: number = 1): LeadSource | null {
    const statuses = this.getAllStatuses()
      .filter((s) => s.source !== 'MANUAL')
      .filter((s) => s.canMakeRequest)
      .filter(
        (s) =>
          !s.creditsRemaining || (s.creditsRemaining && s.creditsRemaining >= requiredCredits),
      );

    /**
     * if
     */
    if (statuses.length === 0) return null;

    statuses.sort((a, b) => {
      const aRatio = a.requestsRemaining / (a.requestsUsed + a.requestsRemaining || 1);
      const bRatio = b.requestsRemaining / (b.requestsUsed + b.requestsRemaining || 1);
      return bRatio - aRatio;
    });

    return statuses[0].source;
  }

  /**
   * waitForAvailability
   */
  async waitForAvailability(source: LeadSource, maxWaitMs: number = 60000): Promise<boolean> {
    const startTime = Date.now();

    /**
     * while
     */
    while (Date.now() - startTime < maxWaitMs) {
      const status = this.getStatus(source);

      /**
       * if
       */
      if (status.canMakeRequest) {
        return true;
      }

      const limits = this.limits.get(source)!;
      /**
       * if
       */
      if (limits.requestsPerMinute) {
        await new Promise((resolve) => setTimeout(resolve, 6000));
      } else {
        return false;
      }
    }

    return false;
  }

  /**
   * exportState
   */
  exportState(): string {
    const state = Array.from(this.usage.entries()).map(([source, record]) => ({
      source,
      ...record,
    }));
    return JSON.stringify(state);
  }

  /**
   * importState
   */
  importState(state: string): void {
    try {
      const parsed = JSON.parse(state) as Array<{ source: LeadSource } & UsageRecord>;
      this.usage.clear();

      /**
       * for
       */
      for (const item of parsed) {
        const { source, ...record } = item;
        this.usage.set(source, record);
      }
    } catch (error) {
      console.error('Failed to import rate limiter state:', error);
    }
  }
}
