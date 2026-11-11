import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import type { PrismaClient } from '@prisma/client';

/**
 * Run with TEST_DATABASE_URL pointing at a throwaway, fully migrated
 * database for the erase tests; the receiver tests need none.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';
process.env.DOMAIN ??= 'http://localhost:3000';
process.env.ENCRYPTION_SECRET ??= 'test-encryption-secret-at-least-32-chars';

const deletions = await import('./registre-deletions');
const { Deletions, DeletionsPath, UserDeletedEvent, formatMicros, parseMicros, cursorAfter } = deletions;
const { prismaStateStore } = await import('./deletion-state');

if (!databaseUrl) console.warn('[registre-deletions.test] TEST_DATABASE_URL unset: skipping the erase DB tests');

const issuer = 'https://sso.test';
const clientId = 'glouton';
const silent = { warn: () => {} };

type Entry = { sub: string; deleted_at: string };

function memoryState(initial = '') {
  const store = { value: initial, saves: 0, failSaves: false };
  return {
    store,
    load: async () => store.value,
    save: async (state: string) => {
      if (store.failSaves) throw new Error('disk full');
      store.value = state;
      store.saves++;
    },
  };
}

function fakeSource(entries: Entry[]) {
  const calls: string[] = [];
  return {
    calls,
    entries,
    identity: { issuer, clientId },
    deletions: async (since: string) => {
      calls.push(since);
      const from = parseMicros(since)!;
      return entries.filter((entry) => parseMicros(entry.deleted_at)! > from).slice(0, deletions.ListLimit);
    },
  };
}

const ago = (seconds: number) => formatMicros(BigInt(Date.now() - seconds * 1000) * 1000n);

function receiver(source: ReturnType<typeof fakeSource>, state = memoryState(), extra: Partial<ConstructorParameters<typeof Deletions>[0]> = {}) {
  const erased: string[] = [];
  const receiverInstance = new Deletions({
    client: source,
    onPersonDeleted: async (provider, subject) => {
      expect(provider).toBe(issuer);
      erased.push(subject);
    },
    state,
    logger: silent,
    ...extra,
  });
  return { receiverInstance, erased, state };
}

describe('timestamps', () => {
  test('microseconds survive a round trip and trailing zeros are trimmed', () => {
    const text = '2026-11-07T10:00:00.123456Z';
    expect(formatMicros(parseMicros(text)!)).toBe(text);
    expect(formatMicros(parseMicros('2026-11-07T10:00:00.500000Z')!)).toBe('2026-11-07T10:00:00.5Z');
    expect(formatMicros(parseMicros('2026-11-07T10:00:00Z')!)).toBe('2026-11-07T10:00:00Z');
    expect(parseMicros('2026-11-07T12:00:00+02:00')).toBe(parseMicros('2026-11-07T10:00:00Z'));
    expect(parseMicros('yesterday')).toBeNull();
  });

  test('the cursor stops before the earliest failure', () => {
    expect(cursorAfter([5n, 9n, 7n], 8n)).toBe(7n);
    expect(cursorAfter([5n, 9n], 0n)).toBe(9n);
    expect(cursorAfter([], 0n)).toBe(0n);
  });
});

describe('polling', () => {
  test('erases each listed person once and persists the cursor', async () => {
    const source = fakeSource([
      { sub: 'a', deleted_at: ago(300) },
      { sub: 'b', deleted_at: ago(200) },
    ]);
    const { receiverInstance, erased, state } = receiver(source);
    await receiverInstance.poll();
    expect(erased).toEqual(['a', 'b']);
    const saved = JSON.parse(state.store.value);
    expect(Object.keys(saved.done).sort()).toEqual(['a', 'b']);
    expect(saved.cursor).toBe(source.entries[1]!.deleted_at);

    await receiverInstance.poll();
    expect(erased).toEqual(['a', 'b']);
  });

  test('a restart reloads the state and does not erase again', async () => {
    const source = fakeSource([{ sub: 'a', deleted_at: ago(300) }]);
    const first = receiver(source);
    await first.receiverInstance.poll();
    const second = receiver(source, first.state);
    await second.receiverInstance.poll();
    expect(second.erased).toEqual([]);
    expect(Date.parse(source.calls.at(-1)!)).toBeGreaterThan(Date.now() - 10 * 60_000);
  });

  test('a first poll starts at the retention horizon', async () => {
    const source = fakeSource([]);
    await receiver(source).receiverInstance.poll();
    const since = Date.parse(source.calls[0]!);
    expect(Date.now() - since).toBeGreaterThan(59 * 86_400_000);
    expect(Date.now() - since).toBeLessThan(61 * 86_400_000);
  });

  test('one failing person does not block the others and holds the cursor back', async () => {
    const source = fakeSource([
      { sub: 'ok-1', deleted_at: ago(300) },
      { sub: 'bad', deleted_at: ago(200) },
      { sub: 'ok-2', deleted_at: ago(100) },
    ]);
    const state = memoryState();
    const erased: string[] = [];
    let failBad = true;
    const instance = new Deletions({
      client: source,
      onPersonDeleted: async (_provider, subject) => {
        if (subject === 'bad' && failBad) throw new Error('database down');
        erased.push(subject);
      },
      state,
      logger: silent,
    });
    await expect(instance.poll()).rejects.toThrow('erase bad');
    expect(erased).toEqual(['ok-1', 'ok-2']);
    expect(JSON.parse(state.store.value).cursor).toBe(source.entries[0]!.deleted_at);

    failBad = false;
    await instance.poll();
    expect(erased).toEqual(['ok-1', 'ok-2', 'bad']);
  });

  test('a failed state save forgets the in-memory copy and the person is handled again', async () => {
    const source = fakeSource([{ sub: 'a', deleted_at: ago(300) }]);
    const { receiverInstance, erased, state } = receiver(source);
    state.store.failSaves = true;
    await expect(receiverInstance.poll()).rejects.toThrow('save the deletion state');
    state.store.failSaves = false;
    await receiverInstance.poll();
    expect(erased).toEqual(['a', 'a']);
    await receiverInstance.poll();
    expect(erased).toEqual(['a', 'a']);
  });

  test('pages through a full list of 1000', async () => {
    const base = Date.now() - 3_000_000;
    const entries = Array.from({ length: 1500 }, (_, index) => ({
      sub: `p${index}`,
      deleted_at: formatMicros(BigInt(base + index * 1000) * 1000n),
    }));
    const source = fakeSource(entries);
    const { receiverInstance, erased } = receiver(source);
    await receiverInstance.poll();
    expect(erased.length).toBe(1500);
    expect(new Set(erased).size).toBe(1500);
  });

  test('1000 notices sharing one instant cannot be paged and are reported', async () => {
    const at = ago(300);
    const entries = Array.from({ length: 1000 }, (_, index) => ({ sub: `s${index}`, deleted_at: at }));
    const { receiverInstance, erased } = receiver(fakeSource(entries));
    await expect(receiverInstance.poll()).rejects.toThrow('share one timestamp');
    expect(erased.length).toBe(1000);
  });

  test('Registre being unreachable is an error, not a silent skip', async () => {
    const source = fakeSource([]);
    source.deletions = async () => {
      throw new Error('registre down');
    };
    await expect(receiver(source).receiverInstance.poll()).rejects.toThrow('registre down');
  });
});

describe('signed push', () => {
  let privateKey: CryptoKey;
  let jwks: { keys: unknown[] };
  let fetches = 0;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey as CryptoKey;
    jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] };
  });

  const fetchJson = async (url: string) => {
    fetches++;
    if (url.endsWith('/.well-known/openid-configuration')) return { issuer, jwks_uri: `${issuer}/jwks` };
    if (url === `${issuer}/jwks`) return jwks;
    throw new Error(`unexpected ${url}`);
  };

  async function notice(overrides: { typ?: string; claims?: Record<string, unknown>; kid?: string; key?: CryptoKey } = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      iss: issuer,
      aud: clientId,
      sub: 'gone',
      iat: now,
      exp: now + 300,
      events: { [UserDeletedEvent]: {} },
      ...overrides.claims,
    })
      .setProtectedHeader({ alg: 'RS256', typ: overrides.typ ?? 'secevent+jwt', kid: overrides.kid ?? 'k1' })
      .sign(overrides.key ?? privateKey);
  }

  const push = (instance: InstanceType<typeof Deletions>, body: string, method = 'POST') =>
    instance.handler(new Request(`http://glouton.test${DeletionsPath}`, { method, body: method === 'POST' ? body : undefined }));

  test('a valid notice erases the person, a replay does nothing more', async () => {
    const { receiverInstance, erased, state } = receiver(fakeSource([]), memoryState(), { fetchJson });
    expect((await push(receiverInstance, await notice())).status).toBe(202);
    expect((await push(receiverInstance, await notice())).status).toBe(202);
    expect(erased).toEqual(['gone']);
    expect(Object.keys(JSON.parse(state.store.value).done)).toEqual(['gone']);
  });

  test('a person pushed and then listed by the poll is erased once', async () => {
    const source = fakeSource([{ sub: 'gone', deleted_at: ago(60) }]);
    const { receiverInstance, erased } = receiver(source, memoryState(), { fetchJson });
    await push(receiverInstance, await notice());
    await receiverInstance.poll();
    expect(erased).toEqual(['gone']);
  });

  test('everything that does not verify is a 400 and erases nobody', async () => {
    const other = await generateKeyPair('RS256');
    const now = Math.floor(Date.now() / 1000);
    const bad: Record<string, string> = {
      garbage: 'not-a-jwt',
      'wrong type': await notice({ typ: 'JWT' }),
      'wrong signer': await notice({ key: other.privateKey as CryptoKey }),
      'wrong issuer': await notice({ claims: { iss: 'https://evil.test' } }),
      'wrong audience': await notice({ claims: { aud: 'someone-else' } }),
      'no event': await notice({ claims: { events: {} } }),
      expired: await notice({ claims: { iat: now - 7200, exp: now - 3600 } }),
      'too long lived': await notice({ claims: { iat: now, exp: now + 7200 } }),
      'no subject': await notice({ claims: { sub: '' } }),
    };
    const { receiverInstance, erased } = receiver(fakeSource([]), memoryState(), { fetchJson });
    for (const [name, token] of Object.entries(bad)) {
      expect({ name, status: (await push(receiverInstance, token)).status }).toEqual({ name, status: 400 });
    }
    expect(erased).toEqual([]);
  });

  test('an unknown kid is unavailable inside the refetch gap, so forged kids cannot hammer Registre', async () => {
    fetches = 0;
    const { receiverInstance } = receiver(fakeSource([]), memoryState(), { fetchJson });
    expect((await push(receiverInstance, await notice({ kid: 'nope' }))).status).toBe(400);
    const afterFirst = fetches;
    expect((await push(receiverInstance, await notice({ kid: 'nope-2' }))).status).toBe(503);
    expect(fetches).toBe(afterFirst);
  });

  test('keys that cannot be fetched are a 503', async () => {
    const failing = async () => {
      throw new (await import('./registre-directory')).DirectoryUnavailableError('down');
    };
    const { receiverInstance } = receiver(fakeSource([]), memoryState(), { fetchJson: failing });
    expect((await push(receiverInstance, await notice())).status).toBe(503);
  });

  test('a failing erase answers 500 so Registre retries', async () => {
    const instance = new Deletions({
      client: fakeSource([]),
      onPersonDeleted: async () => {
        throw new Error('down');
      },
      state: memoryState(),
      logger: silent,
      fetchJson,
    });
    expect((await push(instance, await notice())).status).toBe(500);
  });

  test('only POST is accepted', async () => {
    const { receiverInstance } = receiver(fakeSource([]), memoryState(), { fetchJson });
    const response = await push(receiverInstance, '', 'GET');
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });
});

describe.skipIf(!databaseUrl)('erasing a person against the database', () => {
  let db: PrismaClient;
  let erase: typeof import('@repo/database/erase');
  const ids: Record<string, string> = {};

  async function user(email: string, subject?: string) {
    const created = await db.user.create({
      data: { email, firstName: email.split('@')[0]!, lastName: 'T', password: 'x', emailVerified: true },
    });
    if (subject) {
      await db.account.create({ data: { userId: created.id, providerId: issuer, accountId: subject, refreshToken: 'sealed' } });
      await db.personEntitlement.create({ data: { sub: subject, entitlements: { 'glouton.access': true } } });
    }
    return created.id;
  }

  beforeAll(async () => {
    ({ prisma: db } = await import('@repo/database'));
    erase = await import('@repo/database/erase');
    await db.team.deleteMany({ where: { name: 'erase-test' } });
    await db.user.deleteMany({ where: { email: { endsWith: '@erase.test' } } });
    await db.personEntitlement.deleteMany({ where: { sub: { in: ['sub-gone', 'sub-stays'] } } });

    ids.gone = await user('gone@erase.test', 'sub-gone');
    ids.stays = await user('stays@erase.test', 'sub-stays');
    const team = await db.team.create({ data: { name: 'erase-test' } });
    ids.team = team.id;
    await db.teamMember.createMany({
      data: [
        { teamId: team.id, userId: ids.gone! },
        { teamId: team.id, userId: ids.stays! },
      ],
    });
    await db.lead.create({
      data: { userId: ids.gone!, businessName: 'Personal lead', email: 'lead-personal@erase.test', domain: 'personal.test' } as never,
    });
    await db.lead.create({
      data: { userId: ids.gone!, teamId: team.id, businessName: 'Team lead', email: 'lead-team@erase.test', domain: 'team.test' } as never,
    });
    await db.lead.create({
      data: { userId: ids.stays!, businessName: 'Other lead', email: 'lead-other@erase.test', domain: 'other.test' } as never,
    });
    const expiresAt = new Date(Date.now() + 60_000);
    await db.mcpAction.deleteMany({ where: { id: { in: ['erase-gone', 'erase-stays'] } } });
    await db.mcpAction.createMany({
      data: [
        { id: 'erase-gone', userId: ids.gone!, kind: 'delete_company', target: 'c1', digest: 'd', expiresAt },
        { id: 'erase-stays', userId: ids.stays!, kind: 'delete_company', target: 'c2', digest: 'd', expiresAt },
      ],
    });
  });

  afterAll(async () => {
    await db.team.deleteMany({ where: { name: 'erase-test' } });
    await db.user.deleteMany({ where: { email: { endsWith: '@erase.test' } } });
    await db.mcpAction.deleteMany({ where: { id: { in: ['erase-gone', 'erase-stays'] } } });
  });

  test('a deleted subject loses their account and personal data, the team keeps its rows, others are untouched', async () => {
    await erase.eraseIdentity(db, issuer, 'sub-gone');

    expect(await db.user.findUnique({ where: { id: ids.gone! } })).toBeNull();
    expect(await db.account.count({ where: { providerId: issuer, accountId: 'sub-gone' } })).toBe(0);
    expect(await db.personEntitlement.count({ where: { sub: 'sub-gone' } })).toBe(0);
    expect(await db.lead.count({ where: { businessName: 'Personal lead' } })).toBe(0);
    expect(await db.teamMember.count({ where: { teamId: ids.team!, userId: ids.gone! } })).toBe(0);
    expect(await db.mcpAction.count({ where: { userId: ids.gone! } })).toBe(0);
    expect(await db.mcpAction.count({ where: { id: 'erase-stays' } })).toBe(1);

    const teamLead = await db.lead.findFirst({ where: { businessName: 'Team lead' } });
    expect(teamLead?.userId).toBe(erase.DELETED_USER_ID);
    expect(teamLead?.teamId).toBe(ids.team!);

    expect(await db.user.findUnique({ where: { id: ids.stays! } })).not.toBeNull();
    expect(await db.lead.count({ where: { businessName: 'Other lead' } })).toBe(1);
    expect(await db.personEntitlement.count({ where: { sub: 'sub-stays' } })).toBe(1);
    expect(await db.teamMember.count({ where: { teamId: ids.team!, userId: ids.stays! } })).toBe(1);
  });

  test('a second call is a no-op', async () => {
    await erase.eraseIdentity(db, issuer, 'sub-gone');
    await erase.eraseIdentity(db, issuer, 'sub-unknown');
    expect(await db.lead.count({ where: { businessName: 'Team lead' } })).toBe(1);
    expect(await erase.eraseUser(db, ids.gone!)).toBe(false);
  });

  test('the deleted-user row can never sign in nor be erased', async () => {
    const tombstone = await db.user.findUnique({ where: { id: erase.DELETED_USER_ID } });
    expect(tombstone).toMatchObject({ isBanned: true, status: 'BANNED' });
    expect(await erase.eraseUser(db, erase.DELETED_USER_ID)).toBe(false);
  });

  test('the Prisma state store round-trips through the singleton row', async () => {
    const store = prismaStateStore(db);
    await db.deletionState.deleteMany();
    expect(await store.load()).toBe('');
    await store.save('{"a":1}');
    await store.save('{"a":2}');
    expect(await store.load()).toBe('{"a":2}');
    expect(await db.deletionState.count()).toBe(1);
  });

  test('the full receiver erases through the real store and survives a restart', async () => {
    const victim = await user('victim@erase.test', 'sub-victim');
    const source = fakeSource([{ sub: 'sub-victim', deleted_at: ago(120) }]);
    const state = prismaStateStore(db);
    await db.deletionState.deleteMany();
    const make = () =>
      new Deletions({
        client: source,
        onPersonDeleted: (provider, subject) => erase.eraseIdentity(db, provider, subject),
        state,
        logger: silent,
      });
    await make().poll();
    expect(await db.user.findUnique({ where: { id: victim } })).toBeNull();
    await make().poll();
    expect(JSON.parse((await state.load())!).done['sub-victim']).toBeTruthy();
  });
});
