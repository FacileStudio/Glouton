import { StealthBrowser } from '../stealth/browser';
import type { BrowserConfig } from '../types';
import { logger } from '@repo/logger';

interface PooledBrowser {
  browser: StealthBrowser;
  inUse: boolean;
  activePagesCount: number;
  createdAt: Date;
}

interface BrowserPoolOptions {
  maxBrowsers?: number;
  maxPagesPerBrowser?: number;
  maxBrowserAge?: number;
  browserConfig?: Partial<BrowserConfig>;
  context?: string;
}

const DEFAULT_POOL_OPTIONS: Required<Omit<BrowserPoolOptions, 'browserConfig' | 'context'>> = {
  maxBrowsers: 20,
  maxPagesPerBrowser: 15,
  maxBrowserAge: 15 * 60 * 1000,
};

export class BrowserPool {
  private browsers: PooledBrowser[] = [];
  private options: Required<Omit<BrowserPoolOptions, 'browserConfig' | 'context'>> & {
    browserConfig?: Partial<BrowserConfig>;
    context?: string;
  };
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * constructor
   */
  constructor(options: BrowserPoolOptions = {}) {
    this.options = {
      ...DEFAULT_POOL_OPTIONS,
      ...options,
    };

    this.startCleanupInterval();
  }

  /**
   * startCleanupInterval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupOldBrowsers();
      },
      5 * 60 * 1000
    );
  }

  /**
   * cleanupOldBrowsers
   */
  private async cleanupOldBrowsers(): Promise<void> {
    const now = Date.now();
    const browsersToRemove: number[] = [];

    /**
     * for
     */
    for (let i = 0; i < this.browsers.length; i++) {
      const pooledBrowser = this.browsers[i];
      const age = now - pooledBrowser.createdAt.getTime();

      /**
       * if
       */
      if (!pooledBrowser.inUse && age > this.options.maxBrowserAge) {
        browsersToRemove.push(i);
      }
    }

    /**
     * for
     */
    for (const index of browsersToRemove.reverse()) {
      const pooledBrowser = this.browsers[index];
      try {
        await Promise.race([
          pooledBrowser.browser.close(),
          new Promise((resolve) => setTimeout(resolve, 10000)),
        ]);
        logger.info('Cleaned up old browser from pool');
      } catch (error) {
        logger.error({ error }, 'Failed to close old browser');
      }
      this.browsers.splice(index, 1);
    }
  }

  /**
   * acquire
   */
  async acquire(maxWaitTime = 30000): Promise<StealthBrowser> {
    const startTime = Date.now();

    /**
     * while
     */
    while (Date.now() - startTime < maxWaitTime) {
      let availableBrowser = this.browsers.find(
        (pb) => !pb.inUse && pb.activePagesCount < this.options.maxPagesPerBrowser
      );

      /**
       * if
       */
      if (!availableBrowser && this.browsers.length < this.options.maxBrowsers) {
        const browser = new StealthBrowser(this.options.browserConfig);
        await browser.initialize();

        const pooledBrowser: PooledBrowser = {
          browser,
          inUse: false,
          activePagesCount: 0,
          createdAt: new Date(),
        };

        this.browsers.push(pooledBrowser);
        availableBrowser = pooledBrowser;

        const contextPrefix = this.options.context ? `[${this.options.context}] ` : '';
        logger.info(`${contextPrefix}Created new browser in pool (${this.browsers.length}/${this.options.maxBrowsers})`);
      }

      /**
       * if
       */
      if (!availableBrowser) {
        availableBrowser = this.browsers.find(
          (pb) => pb.activePagesCount < this.options.maxPagesPerBrowser
        );
      }

      /**
       * if
       */
      if (availableBrowser) {
        availableBrowser.inUse = true;
        availableBrowser.activePagesCount++;
        return availableBrowser.browser;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(
      `Failed to acquire browser within ${maxWaitTime}ms - pool exhausted. Stats: ${JSON.stringify(this.getStats())}`
    );
  }

  /**
   * release
   */
  release(browser: StealthBrowser): void {
    const pooledBrowser = this.browsers.find((pb) => pb.browser === browser);

    /**
     * if
     */
    if (pooledBrowser) {
      pooledBrowser.inUse = false;
      pooledBrowser.activePagesCount = Math.max(0, pooledBrowser.activePagesCount - 1);
    }
  }

  /**
   * destroyBrowser
   */
  async destroyBrowser(browser: StealthBrowser): Promise<void> {
    const index = this.browsers.findIndex((pb) => pb.browser === browser);

    /**
     * if
     */
    if (index !== -1) {
      const pooledBrowser = this.browsers[index];

      try {
        await Promise.race([
          pooledBrowser.browser.close(),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch (error) {
        logger.error({ error }, 'Failed to close browser during destroy');
      }

      this.browsers.splice(index, 1);
      logger.info('Destroyed hung browser from pool');
    }
  }

  /**
   * drain
   */
  async drain(): Promise<void> {
    /**
     * if
     */
    if (this.cleanupInterval) {
      /**
       * clearInterval
       */
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const closePromises = this.browsers.map(async (pooledBrowser) => {
      try {
        await Promise.race([
          pooledBrowser.browser.close(),
          new Promise((resolve) => setTimeout(resolve, 10000)),
        ]);
      } catch (error) {
        logger.error({ error }, 'Failed to close browser during drain');
      }
    });

    await Promise.all(closePromises);

    this.browsers = [];
    logger.info('Browser pool drained');
  }

  /**
   * getStats
   */
  getStats(): {
    total: number;
    inUse: number;
    available: number;
    totalPages: number;
  } {
    return {
      total: this.browsers.length,
      inUse: this.browsers.filter((pb) => pb.inUse).length,
      available: this.browsers.filter((pb) => !pb.inUse).length,
      totalPages: this.browsers.reduce((sum, pb) => sum + pb.activePagesCount, 0),
    };
  }
}
