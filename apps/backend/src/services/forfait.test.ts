import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';

/**
 * The gate and value tests run without a database. The persistence tests
 * need TEST_DATABASE_URL pointing at a throwaway database with the current
 * schema pushed; they truncate User and Team, and skip without it.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';
process.env.DOMAIN ??= 'http://localhost:3000';
process.env.ENCRYPTION_SECRET ??= 'test-encryption-secret-at-least-32-chars';

const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch');
const { appRouter, router, protectedProcedure, publicProcedure, forfait } = await import('@repo/trpc');
const { createRegistreSyncRoutes } = await import('../handlers/registre');
const { scopeGuarded } = await import('./register-workers');
const { decodeSnapshot } = await import('./registre-directory');

const issuer = 'https://sso.test';
const silent = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {}, child: () => silent };

type Verdict = { allowed: boolean; enforced: boolean; upgradeUrl: string };

/** A reader with fixed answers: `teams` maps a team id to its access; a missing id is a non-member. */
function fakeReader(options: { personal: boolean; teams?: Record<string, boolean> }) {
  const teams = options.teams ?? {};
  const verdict = (allowed: boolean, url: string): Verdict => ({ allowed, enforced: true, upgradeUrl: url });
  return {
    team: async (_userId: string, teamId: string) =>
      teamId in teams ? verdict(teams[teamId]!, `${issuer}/spaces/spc_${teamId}`) : null,
    personal: async () => verdict(options.personal, `${issuer}/spaces`),
    entitledScopes: async () => ({
      personal: options.personal,
      teamIds: Object.keys(teams).filter((id) => teams[id]),
    }),
  };
}

const noRows = async () => null;

/** One gate call with no input, ids or meta unless given. */
function gateCall(path: string, userId: string | null, extra: Partial<Parameters<typeof forfait.authorize>[1]> = {}) {
  return { path, userId, input: undefined, idKeys: [], meta: undefined, loadRow: noRows, ...extra };
}

const user = { id: 'user-1', email: 'u@example.com', firstName: 'U', lastName: '', role: 'USER', isPremium: false };

/** Calls one procedure over HTTP, as the web app does, and returns the status and decoded body. */
async function call(
  path: string,
  reader: ReturnType<typeof fakeReader>,
  input?: unknown,
  options: { router?: typeof appRouter; signedIn?: boolean; mutation?: boolean } = {}
) {
  const query = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const request = options.mutation
    ? new Request(`http://glouton.test/trpc/${path}`, { method: 'POST', body: JSON.stringify(input ?? {}), headers: { 'content-type': 'application/json' } })
    : new Request(`http://glouton.test/trpc/${path}${query}`);
  const response = await fetchRequestHandler({
    endpoint: '/trpc',
    req: request,
    router: (options.router ?? appRouter) as typeof appRouter,
    createContext: () =>
      ({
        user: options.signedIn === false ? null : user,
        actor: null,
        scopes: null,
        log: silent,
        forfait: reader,
        env: { OIDC_ISSUER: issuer },
      }) as never,
  });
  return { status: response.status, body: (await response.json()) as { error?: { data?: Record<string, unknown> } } };
}

describe('forfait values', () => {
  const access = forfait.GLOUTON_ACCESS;

  test('reads a literal true, and falls back to false on anything malformed', () => {
    expect(forfait.enabled({ 'glouton.access': true }, access)).toBe(true);
    expect(forfait.enabled({ 'glouton.access': false }, access)).toBe(false);
    for (const value of ['true', 1, null, {}, [], -1]) {
      expect(forfait.enabled({ 'glouton.access': value }, access)).toBe(false);
    }
    expect(forfait.enabled(null, access)).toBe(false);
    expect(forfait.enabled([true], access)).toBe(false);
    expect(forfait.enabled({ 'glouton.access': true, 'Bad Key': true }, access)).toBe(false);
    const tooMany = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`a.k${i}`, true]));
    expect(forfait.enabled({ ...tooMany, 'glouton.access': true }, access)).toBe(false);
  });

  test('limits: -1 is unlimited, malformed reads as the default, check cannot overflow', () => {
    const seats = { key: 'glouton.seats', kind: 'limit' as const, default: 3 };
    expect(forfait.limit({ 'glouton.seats': -1 }, seats)).toBe(-1);
    expect(forfait.limit({ 'glouton.seats': 10 }, seats)).toBe(10);
    for (const value of [-2, 1.5, '10', true, Number.MAX_VALUE]) {
      expect(forfait.limit({ 'glouton.seats': value }, seats)).toBe(3);
    }
    expect(() => forfait.check({ 'glouton.seats': -1 }, seats, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, '')).not.toThrow();
    expect(() => forfait.check({ 'glouton.seats': 10 }, seats, 9, 1, '')).not.toThrow();
    expect(() => forfait.check({ 'glouton.seats': 10 }, seats, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 'u')).toThrow(
      forfait.LimitError
    );
  });

  test('upgrade URLs point at the space page, or the spaces list for personal work', () => {
    expect(forfait.upgradeUrl(`${issuer}/`, 'spc_1')).toBe(`${issuer}/spaces/spc_1`);
    expect(forfait.upgradeUrl(issuer, null)).toBe(`${issuer}/spaces`);
  });
});

describe('snapshot decoding', () => {
  test('keeps a positive integer revision and drops malformed entries', () => {
    const good = decodeSnapshot({
      version: 3,
      entitlements_revision: 7,
      spaces: [{ id: 'spc_1', name: 'A', members: [], entitlements: { 'glouton.access': true } }, { id: 2 }, 'x'],
      people: [{ sub: 'sub-1', entitlements: [] }, { sub: '' }, { entitlements: {} }],
    });
    expect(good.entitlements_revision).toBe(7);
    expect(good.spaces.map((space) => space.id)).toEqual(['spc_1']);
    expect(good.people).toEqual([{ sub: 'sub-1', entitlements: undefined }]);
    for (const revision of [0, null, undefined]) {
      expect(decodeSnapshot({ version: 1, entitlements_revision: revision }).entitlements_revision).toBeUndefined();
    }
    for (const bad of ['7', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => decodeSnapshot({ version: 1, entitlements_revision: bad })).toThrow();
      expect(() => decodeSnapshot({ version: bad })).toThrow();
    }
  });
});

describe('plan gate middleware', () => {
  test('refuses a personal call without access with 402 and the upgrade URL', async () => {
    const { status, body } = await call('email.getStats', fakeReader({ personal: false }));
    expect(status).toBe(402);
    expect(body.error?.data?.code).toBe('PAYMENT_REQUIRED');
    expect(body.error?.data?.upgrade_url).toBe(`${issuer}/spaces`);
  });

  test('refuses a team call when the team has no access, pointing at that space', async () => {
    const teamId = '00000000-0000-4000-8000-000000000001';
    const { status, body } = await call(
      'email.getStats',
      fakeReader({ personal: true, teams: { [teamId]: false } }),
      { teamId }
    );
    expect(status).toBe(402);
    expect(body.error?.data?.upgrade_url).toBe(`${issuer}/spaces/spc_${teamId}`);
  });

  test('a forged team id the caller is not a member of is refused, even with personal access', async () => {
    const { status, body } = await call('email.getStats', fakeReader({ personal: true }), {
      teamId: '00000000-0000-4000-8000-00000000dead',
    });
    expect(status).toBe(403);
    expect(body.error?.data?.code).toBe('FORBIDDEN');
  });

  test('personal and team scopes are judged separately', async () => {
    const teamId = '00000000-0000-4000-8000-000000000002';
    const reader = fakeReader({ personal: false, teams: { [teamId]: true } });
    expect((await call('team.getStats', reader, { teamId })).status).not.toBe(402);
    expect((await call('team.create', reader, { name: 'x' }, { mutation: true })).status).toBe(402);
  });

  test('cross-scope reads pass with one entitled team and fail with none', async () => {
    const teamId = '00000000-0000-4000-8000-000000000003';
    const gate = (scopes: ReturnType<typeof fakeReader>) =>
      forfait.authorize(scopes, gateCall('inbox.counts', user.id));
    await expect(gate(fakeReader({ personal: false, teams: { [teamId]: true } }))).resolves.toBeDefined();
    await expect(gate(fakeReader({ personal: false, teams: { [teamId]: false } }))).rejects.toMatchObject({
      code: 'PAYMENT_REQUIRED',
    });
  });

  test('exempt procedures answer without a plan', async () => {
    const reader = fakeReader({ personal: false });
    await expect(forfait.authorize(reader, gateCall('user.me', user.id))).resolves.toBeDefined();
    await expect(forfait.authorize(reader, gateCall('auth.me', user.id))).resolves.toBeDefined();
    const status = await call('forfait.status', reader);
    expect(status.status).toBe(200);
  });

  test('a newly added procedure is gated by default', async () => {
    const extra = router({
      brandNew: router({
        thing: protectedProcedure.query(() => 'secret'),
        open: publicProcedure.query(() => 'secret'),
      }),
    });
    const merged = router({ ...appRouter._def.record, extra }) as unknown as typeof appRouter;
    const reader = fakeReader({ personal: false });
    expect((await call('extra.brandNew.thing', reader, undefined, { router: merged })).status).toBe(402);
    expect((await call('extra.brandNew.open', reader, undefined, { router: merged, signedIn: false })).status).toBe(401);
    const allowed = await call('extra.brandNew.thing', fakeReader({ personal: true }), undefined, { router: merged });
    expect(allowed.status).toBe(200);
  });
});

describe('background jobs', () => {
  test('a job of a scope without access is skipped, not run', async () => {
    let ran = 0;
    const definition = scopeGuarded(
      { name: 'demo', processor: async () => void ran++ },
      async (scope) => scope.teamId === 'paid'
    );
    const job = (data: Record<string, unknown>) => ({ id: '1', data }) as never;
    await definition.processor(job({ userId: 'u', teamId: null }));
    await definition.processor(job({ userId: 'u', teamId: 'unpaid' }));
    await definition.processor(job({ teamId: 'paid' }));
    expect(ran).toBe(0);
    await definition.processor(job({ userId: 'u', teamId: 'paid' }));
    expect(ran).toBe(1);
  });
});

describe('Registre sync webhook', () => {
  test('stays reachable without a session or a plan', async () => {
    let nudges = 0;
    const routes = createRegistreSyncRoutes({ nudge: () => void nudges++ });
    const response = await routes.request('/api/registre/sync', { method: 'POST' });
    expect(response.status).toBe(202);
    expect(nudges).toBe(1);
  });
});

describe.skipIf(!databaseUrl)('entitlements persistence', () => {
  let db: PrismaClient;
  let spaces: typeof import('./registre-spaces');
  const ids: Record<string, string> = {};
  const deps = () => ({ db, issuer, hashPassword: async (p: string) => `hashed:${p}`, logger: silent });
  const member = (sub: string, role = 'owner') => ({ sub, email: `${sub}@example.com`, name: sub, picture: '', role });

  beforeAll(async () => {
    db = (await import('@repo/database')).prisma;
    spaces = await import('./registre-spaces');
    await db.$executeRawUnsafe('TRUNCATE "User", "Team", "PersonEntitlement", "ForfaitState" CASCADE');
    for (const key of ['paid', 'free', 'local']) {
      const row = await db.user.create({ data: { email: `${key}@example.com`, firstName: key, lastName: '', password: 'x' } });
      if (key !== 'local') await db.account.create({ data: { userId: row.id, providerId: issuer, accountId: `sub-${key}` } });
      ids[key] = row.id;
    }
  }, 60_000);

  afterAll(async () => {
    await db.$executeRawUnsafe('TRUNCATE "User", "Team", "PersonEntitlement", "ForfaitState" CASCADE');
  }, 60_000);

  const teamOf = async (spaceId: string) => (await db.team.findUniqueOrThrow({ where: { registreSpaceId: spaceId } })).id;

  test('fails open until a snapshot has an entitlements revision, whatever values it carries', async () => {
    await spaces.applySnapshot(deps(), {
      version: 1,
      spaces: [
        {
          id: 'spc_pro',
          name: 'Pro',
          members: [member('sub-paid'), member('sub-free', 'member')],
          entitlements: { 'glouton.access': false },
        },
      ],
      people: [{ sub: 'sub-free', entitlements: { 'glouton.access': false } }],
    });
    const reader = forfait.dbForfait(db, issuer);
    expect(await reader.personal(ids.free!)).toMatchObject({ allowed: true, enforced: false });
    expect((await reader.team(ids.free!, await teamOf('spc_pro')))?.allowed).toBe(true);
    expect(await db.forfaitState.count()).toBe(0);
  });

  test('enforces once entitlements arrive: personal by sub, team by space, malformed denied', async () => {
    await spaces.applySnapshot(deps(), {
      version: 2,
      entitlements_revision: 5,
      spaces: [
        { id: 'spc_pro', name: 'Pro', members: [member('sub-paid'), member('sub-free', 'member')], entitlements: { 'glouton.access': true } },
        { id: 'spc_odd', name: 'Odd', members: [member('sub-free')], entitlements: { 'glouton.access': 'yes' } },
      ],
      people: [
        { sub: 'sub-paid', entitlements: { 'glouton.access': true } },
        { sub: 'sub-free', entitlements: { 'glouton.access': false } },
      ],
    });
    const reader = forfait.dbForfait(db, issuer);
    expect(await reader.personal(ids.paid!)).toMatchObject({ allowed: true, enforced: true });
    expect(await reader.personal(ids.free!)).toMatchObject({ allowed: false, enforced: true, upgradeUrl: `${issuer}/spaces` });
    expect(await reader.personal(ids.local!)).toMatchObject({ allowed: false });
    expect((await reader.team(ids.free!, await teamOf('spc_pro')))?.allowed).toBe(true);
    const odd = await reader.team(ids.free!, await teamOf('spc_odd'));
    expect(odd).toMatchObject({ allowed: false, upgradeUrl: `${issuer}/spaces/spc_odd` });
    expect(await reader.team(ids.paid!, await teamOf('spc_odd'))).toBeNull();
    expect(await reader.entitledScopes(ids.free!)).toEqual({ personal: false, teamIds: [await teamOf('spc_pro')] });

    const { accessForUser } = await import('@repo/trpc');
    expect(await accessForUser(db, ids.free!, null)).toMatchObject({ personal: false, teamIds: [await teamOf('spc_pro')] });
  });

  test('keeps the last known values across a restart and a snapshot without a revision', async () => {
    await spaces.applySnapshot(deps(), {
      version: 3,
      spaces: [{ id: 'spc_pro', name: 'Pro', members: [member('sub-paid'), member('sub-free', 'member')] }],
    });
    const state = await db.forfaitState.findUniqueOrThrow({ where: { id: 1 } });
    expect(state.revision).toBe(5n);
    const restarted = forfait.dbForfait(db, issuer);
    expect(await restarted.personal(ids.paid!)).toMatchObject({ allowed: true, enforced: true });
    expect(await restarted.personal(ids.free!)).toMatchObject({ allowed: false, enforced: true });
    expect((await restarted.team(ids.free!, await teamOf('spc_pro')))?.allowed).toBe(true);
  });

  test('ignores a snapshot whose revision is lower than the last applied one', async () => {
    const wipe = (version: number, revision: number) => ({
      version,
      entitlements_revision: revision,
      spaces: [{ id: 'spc_pro', name: 'Pro', members: [member('sub-paid'), member('sub-free', 'member')] }],
      people: [],
    });
    await spaces.applySnapshot(deps(), wipe(9, 4));
    const reader = forfait.dbForfait(db, issuer);
    expect((await reader.personal(ids.paid!)).allowed).toBe(true);
    expect((await reader.team(ids.free!, await teamOf('spc_pro')))?.allowed).toBe(true);
    const state = await db.forfaitState.findUniqueOrThrow({ where: { id: 1 } });
    expect({ version: state.version, revision: state.revision }).toEqual({ version: 2n, revision: 5n });
  });

  test('a version rollback or a new issuer resets the marks and keeps enforcing', async () => {
    const snapshot = (version: number, revision: number, access: boolean) => ({
      version,
      entitlements_revision: revision,
      spaces: [{ id: 'spc_pro', name: 'Pro', members: [member('sub-paid'), member('sub-free', 'member')] }],
      people: [{ sub: 'sub-paid', entitlements: { 'glouton.access': access } }],
    });
    await spaces.applySnapshot(deps(), snapshot(1, 1, false));
    let state = await db.forfaitState.findUniqueOrThrow({ where: { id: 1 } });
    expect({ version: state.version, revision: state.revision }).toEqual({ version: 1n, revision: 1n });
    const reader = forfait.dbForfait(db, issuer);
    expect(await reader.personal(ids.paid!)).toMatchObject({ allowed: false, enforced: true });

    await spaces.applySnapshot({ ...deps(), issuer: 'https://sso2.test' }, snapshot(1, 1, true));
    state = await db.forfaitState.findUniqueOrThrow({ where: { id: 1 } });
    expect(state.issuer).toBe('https://sso2.test');
    expect((await forfait.dbForfait(db, issuer).personal(ids.free!)).enforced).toBe(true);
    await spaces.applySnapshot(deps(), snapshot(2, 5, true));
  });

  test('a full snapshot replaces values: a team with no values reads no access, dropped people lose theirs', async () => {
    await spaces.applySnapshot(deps(), {
      version: 4,
      entitlements_revision: 6,
      spaces: [{ id: 'spc_pro', name: 'Pro', members: [member('sub-paid'), member('sub-free', 'member')] }],
      people: [{ sub: 'sub-free', entitlements: { 'glouton.access': true } }],
    });
    const reader = forfait.dbForfait(db, issuer);
    expect((await reader.personal(ids.paid!)).allowed).toBe(false);
    expect((await reader.personal(ids.free!)).allowed).toBe(true);
    expect((await reader.team(ids.free!, await teamOf('spc_pro')))?.allowed).toBe(false);
  });

  test('the job gate reads the same stored values', async () => {
    const allowed = forfait.jobGate(forfait.dbForfait(db, issuer));
    expect(await allowed({ userId: ids.free!, teamId: null })).toBe(true);
    expect(await allowed({ userId: ids.paid!, teamId: null })).toBe(false);
    expect(await allowed({ userId: ids.local!, teamId: await teamOf('spc_pro') })).toBe(false);
  });
});
