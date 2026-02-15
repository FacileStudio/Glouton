import type { ScrapedData } from '../types';
import { logger } from '@repo/logger';

export interface CacheConfig {
  redisUrl?: string;
  defaultTtl?: number;
  enabled?: boolean;
}

export class ScraperCache {
  private cache: Map<string, { data: ScrapedData; expiresAt: number }> = new Map();
  private config: Required<CacheConfig>;
  private redis: any = null;

  /**
   * constructor
   */
  constructor(config: CacheConfig = {}) {
    this.config = {
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      defaultTtl: config.defaultTtl || 7 * 24 * 60 * 60,
      enabled: config.enabled ?? true,
    };

    /**
     * if
     */
    if (!this.config.enabled) {
      logger.info('[ScraperCache] Cache disabled');
      return;
    }

    this.initializeRedis();
  }

  /**
   * initializeRedis
   */
  private async initializeRedis(): Promise<void> {
    try {
      const { Redis } = await import('ioredis');
      this.redis = new Redis(this.config.redisUrl, {
        retryStrategy: (times: number) => {
          /**
           * if
           */
          if (times > 3) {
            logger.warn('[ScraperCache] Redis connection failed, falling back to in-memory cache');
            this.redis = null;
            return null;
          }
          return Math.min(times * 100, 2000);
        },
        maxRetriesPerRequest: 3,
      });

      this.redis.on('error', (error: Error) => {
        logger.error('[ScraperCache] Redis error:', error);
      });

      this.redis.on('connect', () => {
        logger.info('[ScraperCache] Connected to Redis');
      });
    } catch (error) {
      logger.warn('[ScraperCache] Redis not available, using in-memory cache', error);
    }
  }

  /**
   * getCacheKey
   */
  private getCacheKey(url: string): string {
    return `scraper:v1:${url}`;
  }

  /**
   * get
   */
  async get(url: string): Promise<ScrapedData | null> {
    /**
     * if
     */
    if (!this.config.enabled) return null;

    try {
      /**
       * if
       */
      if (this.redis && this.redis.status === 'ready') {
        const cached = await this.redis.get(this.getCacheKey(url));
        /**
         * if
         */
        if (cached) {
          const data = JSON.parse(cached);
          logger.debug(`[ScraperCache] Cache hit for ${url}`);
          return data;
        }
      } else {
        const cached = this.cache.get(url);
        /**
         * if
         */
        if (cached && cached.expiresAt > Date.now()) {
          logger.debug(`[ScraperCache] In-memory cache hit for ${url}`);
          return cached.data;
        } else if (cached) {
          this.cache.delete(url);
        }
      }

      logger.debug(`[ScraperCache] Cache miss for ${url}`);
      return null;
    } catch (error) {
      logger.error(`[ScraperCache] Error getting cache for ${url}:`, error);
      return null;
    }
  }

  /**
   * set
   */
  async set(url: string, data: ScrapedData, ttl?: number): Promise<void> {
    /**
     * if
     */
    if (!this.config.enabled) return;

    const actualTtl = ttl ?? this.config.defaultTtl;

    try {
      /**
       * if
       */
      if (this.redis && this.redis.status === 'ready') {
        await this.redis.setex(
          this.getCacheKey(url),
          actualTtl,
          JSON.stringify(data)
        );
        logger.debug(`[ScraperCache] Cached ${url} in Redis (TTL: ${actualTtl}s)`);
      } else {
        this.cache.set(url, {
          data,
          expiresAt: Date.now() + actualTtl * 1000,
        });
        logger.debug(`[ScraperCache] Cached ${url} in memory (TTL: ${actualTtl}s)`);
      }
    } catch (error) {
      logger.error(`[ScraperCache] Error setting cache for ${url}:`, error);
    }
  }

  /**
   * invalidate
   */
  async invalidate(url: string): Promise<void> {
    /**
     * if
     */
    if (!this.config.enabled) return;

    try {
      /**
       * if
       */
      if (this.redis && this.redis.status === 'ready') {
        await this.redis.del(this.getCacheKey(url));
      } else {
        this.cache.delete(url);
      }
      logger.debug(`[ScraperCache] Invalidated cache for ${url}`);
    } catch (error) {
      logger.error(`[ScraperCache] Error invalidating cache for ${url}:`, error);
    }
  }

  /**
   * clear
   */
  async clear(): Promise<void> {
    /**
     * if
     */
    if (!this.config.enabled) return;

    try {
      /**
       * if
       */
      if (this.redis && this.redis.status === 'ready') {
        const keys = await this.redis.keys('scraper:v1:*');
        /**
         * if
         */
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } else {
        this.cache.clear();
      }
      logger.info('[ScraperCache] Cache cleared');
    } catch (error) {
      logger.error('[ScraperCache] Error clearing cache:', error);
    }
  }

  /**
   * close
   */
  async close(): Promise<void> {
    /**
     * if
     */
    if (this.redis) {
      await this.redis.quit();
    }
  }

  /**
   * getStats
   */
  getStats(): { type: string; size: number } {
    /**
     * if
     */
    if (this.redis && this.redis.status === 'ready') {
      return { type: 'redis', size: -1 };
    }
    return { type: 'memory', size: this.cache.size };
  }
}

let globalCache: ScraperCache | null = null;

/**
 * getScraperCache
 */
export function getScraperCache(config?: CacheConfig): ScraperCache {
  /**
   * if
   */
  if (!globalCache) {
    globalCache = new ScraperCache(config);
  }
  return globalCache;
}
