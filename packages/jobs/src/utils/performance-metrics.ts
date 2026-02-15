import { logger } from '@repo/logger';

export interface PerformanceMetric {
  name: string;
  duration: number;
  success: boolean;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class PerformanceMetrics {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics: number = 1000;

  async track<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const start = Date.now();
    let success = true;

    try {
      const result = await fn();
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const duration = Date.now() - start;
      const metric: PerformanceMetric = {
        name,
        duration,
        success,
        timestamp: new Date(),
        metadata,
      };

      this.metrics.push(metric);

      /**
       * if
       */
      if (this.metrics.length > this.maxMetrics) {
        this.metrics.shift();
      }

      const statusEmoji = success ? '✅' : '❌';
      logger.info(`[PERF] ${statusEmoji} ${name}: ${duration}ms`, metadata);
    }
  }

  /**
   * getMetrics
   */
  getMetrics(name?: string): PerformanceMetric[] {
    /**
     * if
     */
    if (name) {
      return this.metrics.filter(m => m.name === name);
    }
    return this.metrics;
  }

  /**
   * getStats
   */
  getStats(name: string): {
    count: number;
    successCount: number;
    failureCount: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    successRate: number;
  } | null {
    const metrics = this.getMetrics(name);

    /**
     * if
     */
    if (metrics.length === 0) {
      return null;
    }

    const successMetrics = metrics.filter(m => m.success);
    const durations = metrics.map(m => m.duration);

    return {
      count: metrics.length,
      successCount: successMetrics.length,
      failureCount: metrics.length - successMetrics.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: (successMetrics.length / metrics.length) * 100,
    };
  }

  /**
   * getAllStats
   */
  getAllStats(): Record<string, ReturnType<typeof this.getStats>> {
    const names = new Set(this.metrics.map(m => m.name));
    const stats: Record<string, ReturnType<typeof this.getStats>> = {};

    /**
     * for
     */
    for (const name of names) {
      stats[name] = this.getStats(name);
    }

    return stats;
  }

  /**
   * clear
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * logSummary
   */
  logSummary(): void {
    const stats = this.getAllStats();

    logger.info('=== Performance Metrics Summary ===');
    /**
     * for
     */
    for (const [name, stat] of Object.entries(stats)) {
      /**
       * if
       */
      if (!stat) continue;

      logger.info(`
📊 ${name}:
   Count: ${stat.count}
   Success Rate: ${stat.successRate.toFixed(2)}%
   Avg Duration: ${stat.avgDuration.toFixed(2)}ms
   Min/Max: ${stat.minDuration}ms / ${stat.maxDuration}ms
      `);
    }
  }
}

let globalMetrics: PerformanceMetrics | null = null;

/**
 * getPerformanceMetrics
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  /**
   * if
   */
  if (!globalMetrics) {
    globalMetrics = new PerformanceMetrics();
  }
  return globalMetrics;
}

/**
 * trackPerformance
 */
export function trackPerformance<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  return getPerformanceMetrics().track(name, fn, metadata);
}
