import { beforeAll, describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';

/**
 * Run with TEST_DATABASE_URL pointing at a throwaway, fully migrated
 * database: the Apply test truncates User and Team. Without it the DB test
 * skips and says so.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';
process.env.DOMAIN ??= 'http://localhost:3000';
process.env.ENCRYPTION_SECRET ??= 'test-encryption-secret-at-least-32-chars';

const spaces = await import('./registre-spaces');
const issuer = 'https://sso.test';
const silent = { warn: () => {} };

if (!databaseUrl) console.warn('[registre-spaces.test] TEST_DATABASE_URL unset: skipping the Apply DB test');

describe('startDirectorySync', () => {
  test('imports, retrying, before the first sync', async () => {
    const calls: string[] = [];
    let imports = 0;
    const remote = {
      import: async () => {
        calls.push('import');
        if (++imports === 1) throw new Error('registre not deployed yet');
        return { version: 0, spaces: [] };
      },
      snapshot: async () => {
        calls.push('snapshot');
        return { version: 7, spaces: [] };
      },
    };
    const { syncer, ready } = spaces.startDirectorySync({
      remote,
      collect: async () => [],
      apply: async () => void calls.push('apply'),
      logger: silent,
      retry: { initialMs: 1, maxMs: 1, sleep: async () => {} },
    });
    await ready;
    syncer.stop();
    expect(calls).toEqual(['import', 'import', 'snapshot', 'apply']);
  });
});

describe.skipIf(!databaseUrl)('applySnapshot', () => {
  let db: PrismaClient;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = (await import('@repo/database')).prisma;
    await db.$executeRawUnsafe('TRUNCATE "User", "Team" CASCADE');
    const user = async (key: string, sub?: string, emailVerified = true) => {
      const row = await db.user.create({
        data: { email: `${key}@example.com`, firstName: key, lastName: '', password: 'x', emailVerified },
      });
      if (sub) await db.account.create({ data: { userId: row.id, providerId: issuer, accountId: sub } });
      ids[key] = row.id;
    };
    await user('alice', 'sub-alice');
    await user('mallory', undefined, false);
    await user('bob');
    await user('carol', 'sub-carol');
    await user('dave');
    const acme = await db.team.create({
      data: {
        name: 'acme',
        members: {
          create: [
            { userId: ids.alice!, role: 'OWNER' },
            { userId: ids.bob!, role: 'MEMBER' },
            { userId: ids.carol!, role: 'MEMBER' },
            { userId: ids.dave!, role: 'MEMBER' },
          ],
        },
      },
    });
    const solo = await db.team.create({
      data: { name: 'Solo', members: { create: [{ userId: ids.carol!, role: 'OWNER' }] } },
    });
    ids.acme = acme.id;
    ids.solo = solo.id;
  }, 60_000);

  test('links by name, provisions, maps roles, spares local-only users, and is idempotent', async () => {
    const payload = await spaces.buildImport(db, issuer);
    const acmeImport = payload.find((space) => space.name === 'acme');
    expect(acmeImport?.members).toContainEqual({ sub: 'sub-alice', role: 'owner' });
    expect(acmeImport?.members).toContainEqual({ email: 'bob@example.com', role: 'member' });

    const snapshot = {
      version: 1,
      spaces: [
        {
          id: 'space-1',
          name: 'Acme',
          members: [
            { sub: 'sub-alice', email: 'alice@example.com', name: 'Alice', picture: '', role: 'owner' },
            { sub: 'sub-bob', email: 'BOB@example.com', name: 'Bob', picture: '', role: 'admin' },
            {
              sub: 'sub-erin',
              email: 'erin@example.com',
              name: 'Erin Example',
              picture: 'https://sso.test/avatars/sub-erin',
              role: 'member',
            },
          ],
        },
      ],
    };
    const deps = { db, issuer, hashPassword: async (p: string) => `hashed:${p}`, logger: silent };
    await spaces.applySnapshot(deps, snapshot);

    const acme = await db.team.findUniqueOrThrow({
      where: { id: ids.acme },
      include: { members: { include: { user: true } } },
    });
    expect(acme.registreSpaceId).toBe('space-1');
    expect(acme.name).toBe('Acme');
    const roles = Object.fromEntries(acme.members.map((m) => [m.user.email, m.role]));
    expect(roles).toEqual({
      'alice@example.com': 'OWNER',
      'bob@example.com': 'ADMIN',
      'dave@example.com': 'MEMBER',
      'erin@example.com': 'MEMBER',
    });
    const erin = acme.members.find((m) => m.user.email === 'erin@example.com')!.user;
    expect(erin.firstName).toBe('Erin');
    expect(erin.avatarUrl).toBe('https://sso.test/avatars/sub-erin');
    expect(await db.account.count({ where: { providerId: issuer, accountId: 'sub-bob', userId: ids.bob } })).toBe(1);
    expect(await db.account.count({ where: { providerId: issuer, accountId: 'sub-erin', userId: erin.id } })).toBe(1);
    const solo = await db.team.findUniqueOrThrow({ where: { id: ids.solo }, include: { members: true } });
    expect(solo.registreSpaceId).toBeNull();
    expect(solo.members).toHaveLength(1);

    const state = async () => ({
      users: await db.user.count(),
      accounts: await db.account.count(),
      teams: await db.team.count(),
      memberships: await db.teamMember.findMany({ orderBy: { id: 'asc' } }),
      acme: (await db.team.findUniqueOrThrow({ where: { id: ids.acme } })).updatedAt,
    });
    const before = await state();
    await spaces.applySnapshot(deps, snapshot);
    expect(await state()).toEqual(before);
  }, 60_000);

  test('never links a Registre member to an unverified local account with the same email', async () => {
    const deps = { db, issuer, hashPassword: async (p: string) => `hashed:${p}`, logger: silent };
    await spaces.applySnapshot(deps, {
      version: 2,
      spaces: [
        {
          id: 'space-1',
          name: 'Acme',
          members: [
            { sub: 'sub-alice', email: 'alice@example.com', name: 'Alice', picture: '', role: 'owner' },
            { sub: 'sub-mallory', email: 'MALLORY@example.com', name: 'Victim', picture: '', role: 'admin' },
          ],
        },
      ],
    });
    expect(await db.account.count({ where: { providerId: issuer, accountId: 'sub-mallory' } })).toBe(0);
    expect(await db.teamMember.count({ where: { userId: ids.mallory, teamId: ids.acme } })).toBe(0);
    expect(await db.user.count({ where: { email: { equals: 'mallory@example.com', mode: 'insensitive' } } })).toBe(1);
  }, 60_000);
});
