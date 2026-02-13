import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

export const db = prisma;

if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type * from '@prisma/client';
export { UserRole, Prisma } from '@prisma/client';
export type InputJsonValue = Prisma.InputJsonValue;
export type JsonValue = Prisma.JsonValue;
