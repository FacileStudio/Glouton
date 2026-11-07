import type { PrismaClient } from '@prisma/client';
import type { StateStore } from './registre-deletions';

/** Persists the deletion receiver's state in the singleton DeletionState row. */
export function prismaStateStore(db: Pick<PrismaClient, 'deletionState'>): StateStore {
  return {
    async load() {
      const row = await db.deletionState.findUnique({ where: { id: 1 }, select: { state: true } });
      return row?.state ?? '';
    },
    async save(state) {
      await db.deletionState.upsert({
        where: { id: 1 },
        create: { id: 1, state },
        update: { state },
      });
    },
  };
}
