import type { PrismaClient, Prisma } from '@prisma/client';
import type { Logger } from '@repo/logger';

const BATCH_SIZE = 500;

export interface BatchImportResult {
  totalProcessed: number;
  totalImported: number;
  totalDuplicates: number;
  errors: string[];
}

export interface BatchImportOptions {
  prisma: PrismaClient;
  logger: Logger;
  leads: Prisma.LeadCreateManyInput[];
  onProgress?: (imported: number, total: number) => void | Promise<void>;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export async function batchImportLeads({
  prisma,
  logger,
  leads,
  onProgress,
}: BatchImportOptions): Promise<BatchImportResult> {
  const chunks = chunkArray(leads, BATCH_SIZE);
  let totalImported = 0;
  let totalDuplicates = 0;
  const errors: string[] = [];

  logger.info({
    action: 'batch-import-start',
    totalLeads: leads.length,
    batchSize: BATCH_SIZE,
    totalBatches: chunks.length,
  });

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const batchNumber = i + 1;

    try {
      const result = await prisma.lead.createMany({
        data: chunk,
        skipDuplicates: true,
      });

      totalImported += result.count;
      totalDuplicates += chunk.length - result.count;

      logger.debug({
        action: 'batch-import-chunk',
        batchNumber,
        chunkSize: chunk.length,
        imported: result.count,
        duplicates: chunk.length - result.count,
      });

      if (onProgress) {
        await onProgress(totalImported, leads.length);
      }
    } catch (error) {
      const errorMsg = `Batch ${batchNumber} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);

      logger.error({
        action: 'batch-import-chunk-failed',
        batchNumber,
        error: errorMsg,
      });
    }
  }

  logger.info({
    action: 'batch-import-complete',
    totalProcessed: leads.length,
    totalImported,
    totalDuplicates,
    errorCount: errors.length,
  });

  return {
    totalProcessed: leads.length,
    totalImported,
    totalDuplicates,
    errors,
  };
}
