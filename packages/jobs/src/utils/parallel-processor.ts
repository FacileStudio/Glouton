import { logger } from '@repo/logger';

export interface ParallelProcessorOptions {
  minDelay?: number;
  maxDelay?: number;
  onProgress?: (processed: number, total: number) => void;
  onError?: (error: Error, item: any) => void;
}

export class ParallelProcessor {
  /**
   * constructor
   */
  constructor(private concurrency: number = 50) {
    /**
     * if
     */
    if (concurrency < 1) {
      throw new Error('Concurrency must be at least 1');
    }
  }

  async processInParallel<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    options: ParallelProcessorOptions = {}
  ): Promise<Array<{ status: 'fulfilled'; value: R } | { status: 'rejected'; reason: any }>> {
    /**
     * if
     */
    if (items.length === 0) {
      return [];
    }

    const results: Array<{ status: 'fulfilled'; value: R } | { status: 'rejected'; reason: any }> = [];
    const queue = [...items];
    let active = 0;
    let processed = 0;
    let activePromises = new Set<Promise<void>>();

    return new Promise((resolve) => {
      /**
       * checkCompletion
       */
      const checkCompletion = () => {
        /**
         * if
         */
        if (queue.length === 0 && active === 0) {
          /**
           * resolve
           */
          resolve(results);
        }
      };

      /**
       * processNext
       */
      const processNext = async () => {
        /**
         * while
         */
        while (queue.length > 0 && active < this.concurrency) {
          const item = queue.shift();
          /**
           * if
           */
          if (!item) break;

          active++;

          /**
           * promise
           */
          const promise = (async () => {
            try {
              const result = await processor(item);
              results.push({ status: 'fulfilled', value: result });
            } catch (error) {
              const err = error instanceof Error ? error : new Error(String(error));
              results.push({ status: 'rejected', reason: err });

              /**
               * if
               */
              if (options.onError) {
                options.onError(err, item);
              } else {
                logger.error({ error: err, item }, 'ParallelProcessor: Processing failed');
              }
            } finally {
              processed++;
              active--;
              activePromises.delete(promise);

              /**
               * if
               */
              if (options.onProgress) {
                options.onProgress(processed, items.length);
              }

              /**
               * if
               */
              if (options.minDelay !== undefined || options.maxDelay !== undefined) {
                const minDelay = options.minDelay ?? 0;
                const maxDelay = options.maxDelay ?? minDelay;
                const delay = minDelay + Math.random() * (maxDelay - minDelay);

                /**
                 * if
                 */
                if (delay > 0) {
                  await new Promise(resolve => setTimeout(resolve, delay));
                }
              }

              /**
               * checkCompletion
               */
              checkCompletion();
              /**
               * processNext
               */
              processNext();
            }
          })();

          activePromises.add(promise);
        }
      };

      /**
       * for
       */
      for (let i = 0; i < this.concurrency; i++) {
        /**
         * processNext
         */
        processNext();
      }
    });
  }

  async processBatches<T, R>(
    items: T[],
    batchSize: number,
    batchProcessor: (batch: T[]) => Promise<R[]>,
    options: ParallelProcessorOptions = {}
  ): Promise<R[]> {
    const batches: T[][] = [];

    /**
     * for
     */
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    const results = await this.processInParallel(
      batches,
      batchProcessor,
      options
    );

    return results
      .filter((r): r is { status: 'fulfilled'; value: R[] } => r.status === 'fulfilled')
      .flatMap(r => r.value);
  }
}
