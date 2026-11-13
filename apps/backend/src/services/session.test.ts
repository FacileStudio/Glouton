import { afterAll, describe, expect, test } from 'bun:test';
import { AuthManager } from '@repo/auth';
import { UserRole } from '@repo/types';
import { prisma } from '@repo/database';
import { eraseUser } from '@repo/database/erase';
import { sessionValid } from './session';

const databaseUrl = process.env.TEST_DATABASE_URL;
const secret = process.env.ENCRYPTION_SECRET!;
const sessionOf = (id: string) => ({
  id,
  email: `${id}@example.com`,
  firstName: 'A',
  lastName: 'B',
  role: UserRole.USER,
  isPremium: false,
});

describe('session revocation', () => {
  test('a token stops verifying once sessionValid says the session is gone', async () => {
    let present = true;
    const auth = new AuthManager({ encryptionSecret: secret, sessionValid: async () => present });
    const token = await auth.createToken(sessionOf('u1'));
    expect((await auth.verifyToken(token))?.id).toBe('u1');
    present = false;
    expect(await auth.verifyToken(token)).toBeNull();
  });

  test.skipIf(!databaseUrl)('an erased person\'s token is rejected, a bystander\'s is not', async () => {
    const auth = new AuthManager({ encryptionSecret: secret, sessionValid: sessionValid(prisma) });
    const make = (email: string) =>
      prisma.user.create({ data: { email, firstName: 'A', lastName: 'B', password: 'x', emailVerified: true } });
    const gone = await make('session-gone@example.com');
    const kept = await make('session-kept@example.com');
    const goneToken = await auth.createToken(sessionOf(gone.id));
    const keptToken = await auth.createToken(sessionOf(kept.id));
    expect((await auth.verifyToken(goneToken))?.id).toBe(gone.id);

    await eraseUser(prisma, gone.id);

    expect(await auth.verifyToken(goneToken)).toBeNull();
    expect((await auth.verifyToken(keptToken))?.id).toBe(kept.id);
    await prisma.user.delete({ where: { id: kept.id } });
  });
});

afterAll(() => prisma.$disconnect());
