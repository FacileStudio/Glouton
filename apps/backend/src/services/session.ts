import type { PrismaClient } from '@prisma/client';

/** A session token outlives the person it names only until the user row is gone: erasure deletes that row, so every token of an erased person stops verifying at once. */
export const userExists =
  (db: Pick<PrismaClient, 'user'>) =>
  async (userId: string): Promise<boolean> =>
    (await db.user.findUnique({ where: { id: userId }, select: { id: true } })) !== null;
