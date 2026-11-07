import type { Prisma, PrismaClient } from '@prisma/client';

/** The row that keeps the authorship of team data after its author is erased. */
export const DELETED_USER_ID = 'deleted-user';

const DELETED_USER_EMAIL = 'deleted-user@deleted.invalid';

type Db = Pick<PrismaClient, '$transaction'>;

async function eraseInTransaction(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  if (userId === DELETED_USER_ID) return false;
  const exists = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) return false;

  await tx.user.upsert({
    where: { id: DELETED_USER_ID },
    create: {
      id: DELETED_USER_ID,
      email: DELETED_USER_EMAIL,
      firstName: 'Utilisateur',
      lastName: 'supprimé',
      password: '',
      isBanned: true,
      status: 'BANNED',
    },
    update: {},
  });

  const teamOwned = { userId, teamId: { not: null } };
  const handOver = { userId: DELETED_USER_ID };
  await tx.lead.updateMany({ where: teamOwned, data: handOver });
  await tx.huntSession.updateMany({ where: teamOwned, data: handOver });
  await tx.auditSession.updateMany({ where: teamOwned, data: handOver });
  await tx.emailOutreach.updateMany({ where: teamOwned, data: handOver });
  await tx.company.updateMany({ where: teamOwned, data: handOver });
  await tx.person.updateMany({ where: teamOwned, data: handOver });
  await tx.activity.updateMany({ where: teamOwned, data: handOver });
  await tx.suggestion.updateMany({ where: teamOwned, data: handOver });

  await tx.user.delete({ where: { id: userId } });
  return true;
}

/**
 * Erases one person: their personal rows, sessions, identities and account go
 * (the foreign keys cascade). Rows they authored inside a team are handed to
 * the "deleted user" row, because the team owns them. Returns false when the
 * user does not exist, so a second call is a no-op.
 */
export function eraseUser(db: Db, userId: string): Promise<boolean> {
  return db.$transaction((tx) => eraseInTransaction(tx, userId));
}

/**
 * Erases the person Registre identifies by `subject` under `issuer`: their
 * Glouton account and the entitlements Registre pushed for them. Idempotent;
 * an unknown subject only clears the leftover entitlement row.
 */
export function eraseIdentity(db: Db, issuer: string, subject: string): Promise<void> {
  return db.$transaction(async (tx) => {
    const identity = await tx.account.findUnique({
      where: { providerId_accountId: { providerId: issuer, accountId: subject } },
      select: { userId: true },
    });
    await tx.personEntitlement.deleteMany({ where: { sub: subject } });
    if (identity) await eraseInTransaction(tx, identity.userId);
  });
}
