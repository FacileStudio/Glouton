import type { PrismaClient } from '@prisma/client';

/**
 * Whether a session token issued at `issuedAt` (seconds since the epoch) still
 * stands for `userId`. It fails once the user row is gone, so erasure ends
 * every token at once, and for any token issued in or before the second of
 * the user's last sign-out everywhere (`sessionsRevokedAt`).
 */
export const sessionValid =
  (db: Pick<PrismaClient, 'user'>) =>
  async (userId: string, issuedAt: number): Promise<boolean> => {
    const user = await db.user.findUnique({ where: { id: userId }, select: { sessionsRevokedAt: true } });
    if (!user) return false;
    return !user.sessionsRevokedAt || issuedAt * 1000 > user.sessionsRevokedAt.getTime();
  };

/** Ends every Glouton session of these users: each token issued so far stops verifying. */
export async function revokeSessions(
  db: Pick<PrismaClient, 'user'>,
  userIds: string[],
  now: Date = new Date()
): Promise<void> {
  if (userIds.length === 0) return;
  await db.user.updateMany({ where: { id: { in: userIds } }, data: { sessionsRevokedAt: now } });
}
