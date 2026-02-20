export class BatchProcessor {
  async processBatch<T, R>(
    items: T[],
    batchSize: number,
    processor: (batch: T[]) => Promise<R[]>,
    options?: {
      delayMs?: number;
      onBatchComplete?: (results: R[], batchIndex: number) => void | Promise<void>;
    }
  ): Promise<R[]> {
    const allResults: R[] = [];
    const delayMs = options?.delayMs || 0;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const results = await processor(batch);
      allResults.push(...results);

      if (options?.onBatchComplete) {
        await options.onBatchComplete(results, Math.floor(i / batchSize));
      }

      if (delayMs > 0 && i + batchSize < items.length) {
        await this.delay(delayMs);
      }
    }

    return allResults;
  }

  async processParallelBatch<T, R>(
    items: T[],
    batchSize: number,
    processor: (item: T) => Promise<R>,
    options?: {
      delayMs?: number;
      onBatchComplete?: (results: PromiseSettledResult<R>[], batchIndex: number) => void | Promise<void>;
    }
  ): Promise<PromiseSettledResult<R>[]> {
    const allResults: PromiseSettledResult<R>[] = [];
    const delayMs = options?.delayMs || 0;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const promises = batch.map((item) => processor(item));
      const results = await Promise.allSettled(promises);
      allResults.push(...results);

      if (options?.onBatchComplete) {
        await options.onBatchComplete(results, Math.floor(i / batchSize));
      }

      if (delayMs > 0 && i + batchSize < items.length) {
        await this.delay(delayMs);
      }
    }

    return allResults;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
