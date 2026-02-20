import { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

export function buildWhereClause<T extends Record<string, any>>(
  filters: Record<string, any>
): T {
  const cleanedFilters: Record<string, any> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === 'string' && value.trim() === '') {
      continue;
    }

    if (typeof value === 'string') {
      cleanedFilters[key] = {
        contains: value,
        mode: 'insensitive',
      };
    } else if (Array.isArray(value)) {
      if (value.length > 0) {
        cleanedFilters[key] = {
          in: value,
        };
      }
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      cleanedFilters[key] = value;
    } else {
      cleanedFilters[key] = value;
    }
  }

  return cleanedFilters as T;
}

export function paginationParams(page?: number, limit?: number) {
  const actualPage = page && page > 0 ? page : 1;
  const actualLimit = limit && limit > 0 ? limit : 50;

  return {
    skip: (actualPage - 1) * actualLimit,
    take: actualLimit,
  };
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function calculatePagination(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);

  return {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export class PrismaErrorHandler extends Error {
  public code?: string;
  public statusCode: number;

  constructor(message: string, code?: string, statusCode: number = 500) {
    super(message);
    this.name = 'PrismaErrorHandler';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function handlePrismaError(error: unknown): PrismaErrorHandler {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const fields = (error.meta?.target as string[]) || [];
        const fieldNames = fields.join(', ');
        return new PrismaErrorHandler(
          `A record with this ${fieldNames} already exists`,
          'P2002',
          409
        );
      }

      case 'P2025':
        return new PrismaErrorHandler(
          'Record not found',
          'P2025',
          404
        );

      case 'P2003':
        return new PrismaErrorHandler(
          'Foreign key constraint failed',
          'P2003',
          400
        );

      case 'P2014':
        return new PrismaErrorHandler(
          'Invalid relation reference',
          'P2014',
          400
        );

      case 'P2015':
        return new PrismaErrorHandler(
          'Related record not found',
          'P2015',
          404
        );

      case 'P2016':
        return new PrismaErrorHandler(
          'Query interpretation error',
          'P2016',
          400
        );

      case 'P2021':
        return new PrismaErrorHandler(
          'Table does not exist',
          'P2021',
          500
        );

      case 'P2022':
        return new PrismaErrorHandler(
          'Column does not exist',
          'P2022',
          500
        );

      case 'P2023':
        return new PrismaErrorHandler(
          'Inconsistent column data',
          'P2023',
          400
        );

      default:
        return new PrismaErrorHandler(
          error.message || 'Database operation failed',
          error.code,
          500
        );
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new PrismaErrorHandler(
      'Validation error: Invalid data provided',
      'VALIDATION_ERROR',
      400
    );
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new PrismaErrorHandler(
      'Database connection failed',
      'CONNECTION_ERROR',
      503
    );
  }

  if (error instanceof Error) {
    return new PrismaErrorHandler(
      error.message,
      'UNKNOWN_ERROR',
      500
    );
  }

  return new PrismaErrorHandler(
    'An unknown error occurred',
    'UNKNOWN_ERROR',
    500
  );
}

export function jsonbArrayLength(field: string): Prisma.Sql {
  return Prisma.sql`jsonb_array_length("${Prisma.raw(field)}")`;
}

export function jsonbArrayContains(field: string, value: any): Prisma.Sql {
  return Prisma.sql`"${Prisma.raw(field)}" @> ${JSON.stringify([value])}::jsonb`;
}

export function jsonbObjectContains(
  field: string,
  key: string,
  value: any
): Prisma.Sql {
  return Prisma.sql`"${Prisma.raw(field)}"->>'${Prisma.raw(key)}' = ${value}`;
}

export async function withTransaction<T>(
  prisma: PrismaClient,
  operations: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return await prisma.$transaction(async (tx) => {
    return await operations(tx);
  });
}

export interface BatchOperationResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  errors: Array<{ index: number; error: string }>;
}

export async function batchOperation<T, R>(
  items: T[],
  operation: (item: T, index: number) => Promise<R>,
  options: {
    batchSize?: number;
    continueOnError?: boolean;
  } = {}
): Promise<BatchOperationResult> {
  const { batchSize = 100, continueOnError = true } = options;
  const errors: Array<{ index: number; error: string }> = [];
  let successCount = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map((item, batchIndex) => operation(item, i + batchIndex))
    );

    results.forEach((result, batchIndex) => {
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        errors.push({
          index: i + batchIndex,
          error: result.reason?.message || 'Unknown error',
        });

        if (!continueOnError) {
          throw new Error(
            `Batch operation failed at index ${i + batchIndex}: ${result.reason?.message}`
          );
        }
      }
    });
  }

  return {
    success: errors.length === 0,
    successCount,
    errorCount: errors.length,
    errors,
  };
}

export function orderByParams<T extends Record<string, any>>(
  sortBy?: string,
  sortOrder?: 'asc' | 'desc'
): T[] {
  if (!sortBy) {
    return [] as T[];
  }

  const order = sortOrder || 'asc';

  if (sortBy.includes('.')) {
    const [relation, field] = sortBy.split('.');
    return [
      {
        [relation]: {
          [field]: order,
        },
      } as T,
    ];
  }

  return [{ [sortBy]: order } as T];
}

export interface SoftDeleteConfig {
  deletedAtField?: string;
}

export function createSoftDeleteExtension(
  config: SoftDeleteConfig = {}
) {
  const deletedAtField = config.deletedAtField || 'deletedAt';

  return Prisma.defineExtension({
    name: 'softDelete',
    query: {
      $allModels: {
        async delete({ args, query }: any) {
          return query({
            ...args,
            data: { [deletedAtField]: new Date() },
          });
        },
        async deleteMany({ args, query }: any) {
          return query({
            ...args,
            data: { [deletedAtField]: new Date() },
          });
        },
        async findUnique({ args, query }: any) {
          return query({
            ...args,
            where: {
              ...args.where,
              [deletedAtField]: null,
            },
          });
        },
        async findFirst({ args, query }: any) {
          return query({
            ...args,
            where: {
              ...args.where,
              [deletedAtField]: null,
            },
          });
        },
        async findMany({ args, query }: any) {
          return query({
            ...args,
            where: {
              ...args.where,
              [deletedAtField]: null,
            },
          });
        },
        async count({ args, query }: any) {
          return query({
            ...args,
            where: {
              ...args.where,
              [deletedAtField]: null,
            },
          });
        },
      },
    },
  });
}

export function upsertHelper<T extends { id?: string | number }>(
  data: T,
  uniqueField: keyof T = 'id'
): { create: Omit<T, 'id'>; update: Partial<T> } {
  const { id, ...rest } = data;

  return {
    create: rest as Omit<T, 'id'>,
    update: data,
  };
}

export async function findOrCreate<T>(
  findOperation: () => Promise<T | null>,
  createOperation: () => Promise<T>
): Promise<{ data: T; created: boolean }> {
  let existing = await findOperation();

  if (existing) {
    return { data: existing, created: false };
  }

  const created = await createOperation();
  return { data: created, created: true };
}
