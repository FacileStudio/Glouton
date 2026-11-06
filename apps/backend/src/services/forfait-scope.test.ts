import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';

/**
 * Row-scope and account-security tests for the plan gate. The pure tests run
 * without a database; the by-id tests (the security review's proof of
 * concept, inverted so every case must refuse) need TEST_DATABASE_URL and
 * skip without it.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';
process.env.DOMAIN ??= 'http://localhost:3000';
process.env.ENCRYPTION_SECRET ??= 'test-encryption-secret-at-least-32-chars';

const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch');
const { appRouter, forfait, targetTeam } = await import('@repo/trpc');
const { findOidcUser, UnverifiedAccountError } = await import('./oidc');
const { assertSecureIssuer, readCapped, DirectoryClient, DirectoryUnavailableError } = await import('./registre-directory');
const { createRegistreSyncRoutes } = await import('../handlers/registre');
const { nudgeLimiter } = await import('../middleware/rate-limit');

const silent = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {}, child: () => silent };
const verdict = (allowed: boolean, url = 'https://sso.test/spaces') => ({ allowed, enforced: true, upgradeUrl: url });

/** A fixed reader: `teams` maps a team id to its access; a missing id is a non-member. */
function reader(personal: boolean, teams: Record<string, boolean> = {}) {
  return {
    team: async (_userId: string, teamId: string) => (teamId in teams ? verdict(teams[teamId]!) : null),
    personal: async () => verdict(personal),
    entitledScopes: async () => ({ personal, teamIds: Object.keys(teams).filter((id) => teams[id]) }),
  };
}

/** Calls one procedure over HTTP with a real prisma (when given) and a fixed reader. */
async function call(
  path: string,
  user: { id: string; email: string; role: string },
  scopes: ReturnType<typeof reader>,
  input: unknown,
  options: { prisma?: unknown; mutation?: boolean; env?: Record<string, unknown> } = {}
) {
  const query = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const req = options.mutation
    ? new Request(`http://g.test/trpc/${path}`, {
        method: 'POST',
        body: JSON.stringify(input),
        headers: { 'content-type': 'application/json' },
      })
    : new Request(`http://g.test/trpc/${path}${query}`);
  const res = await fetchRequestHandler({
    endpoint: '/trpc',
    req,
    router: appRouter,
    createContext: () =>
      ({
        user,
        actor: null,
        scopes: null,
        log: silent,
        forfait: scopes,
        prisma: options.prisma,
        env: { OIDC_ISSUER: 'https://sso.test', ...options.env },
      }) as never,
  });
  return { status: res.status, body: (await res.json()) as { error?: { data?: Record<string, unknown> } } };
}

describe('every by-id procedure declares its scope', () => {
  test('no registered procedure takes a row id without a row or ids rule', () => {
    const undeclared = forfait
      .registeredProcedures()
      .filter(({ path, idKeys }) => idKeys.length > 0 && !forfait.isCrossScope(path))
      .filter(({ path }) => {
        const meta = (appRouter._def.procedures as unknown as Record<string, { _def: { meta?: { forfait?: unknown } } }>)[path]!._def
          .meta;
        return !meta?.forfait;
      })
      .map(({ path }) => path);
    expect(undeclared).toEqual([]);
  });

  test('every non-cross-scope procedure has an input schema the gate can read', () => {
    const unreadable = forfait
      .registeredProcedures()
      .filter(({ path, readable }) => !readable && !forfait.isCrossScope(path))
      .map(({ path }) => path);
    expect(unreadable).toEqual([]);
  });

  test('schemas the gate cannot read are reported as such', async () => {
    const { z } = await import('zod');
    const object = z.object({ teamId: z.string() });
    expect(forfait.shapeKeys(object.optional().default({ teamId: 'x' }))).toEqual(['teamId']);
    expect(forfait.shapeKeys(object.refine(() => true))).toEqual(['teamId']);
    expect(forfait.shapeKeys(object.and(z.object({ leadId: z.string() })))).toBeNull();
    expect(forfait.shapeKeys(z.union([object, z.object({ leadId: z.string() })]))).toBeNull();
    expect(forfait.shapeKeys(z.array(object))).toBeNull();
    expect(forfait.shapeKeys(z.string())).toBeNull();
  });

  test('an unreadable input is refused unless the procedure is cross-scope', async () => {
    const base = { userId: 'u', input: { leadId: 'x' }, idKeys: [], meta: undefined, loadRow: async () => null, readable: false };
    await expect(forfait.authorize(reader(true), { ...base, path: 'lead.brandNew' })).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    await expect(forfait.authorize(reader(true), { ...base, path: 'contact.brandNew' })).resolves.toBeDefined();
  });

  test('an undeclared by-id procedure is refused at runtime', async () => {
    const call = { path: 'brand.new', userId: 'u', input: { fooId: 'x' }, idKeys: ['fooId'], meta: undefined, loadRow: async () => null };
    await expect(forfait.authorize(reader(true), call)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });

  test('a teamId the procedure does not declare is stripped before the gate', async () => {
    expect(await forfait.parsedInput('lead.query.getById', { leadId: crypto.randomUUID(), teamId: 'x' })).not.toHaveProperty(
      'teamId'
    );
  });
});

describe('account procedures and shared templates', () => {
  const user = { id: 'user-1', email: 'u@example.com', role: 'USER' };
  const teamId = '00000000-0000-4000-8000-0000000000aa';

  test('a Solo person who pays through a team keeps their own account', async () => {
    const scopes = reader(false, { [teamId]: true });
    for (const path of ['user.updateProfile', 'user.changePassword', 'user.updateSmtpConfig']) {
      expect(forfait.ACCOUNT.has(path)).toBe(true);
    }
    await expect(
      forfait.authorize(scopes, { path: 'user.getSmtpConfig', userId: user.id, input: undefined, idKeys: [], meta: undefined, loadRow: async () => null })
    ).resolves.toBeDefined();
    expect((await call('email.getTemplates', user, scopes, undefined)).status).toBe(200);
  });

  test('templates still need one entitled scope', async () => {
    expect((await call('email.getTemplates', user, reader(false, { [teamId]: false }), undefined)).status).toBe(402);
  });

  test('convertToLead is no longer cross-scope', () => {
    expect(forfait.isCrossScope('companyCreation.convertToLead')).toBe(false);
    expect(forfait.isCrossScope('companyCreation.list')).toBe(true);
  });
});

describe('assistant procedures', () => {
  const user = { id: 'user-1', email: 'u@example.com', role: 'USER' };
  const teamId = '00000000-0000-4000-8000-0000000000bb';

  test('none is exempt: status needs the personal plan or the named team', async () => {
    for (const path of ['assistant.status', 'assistant.write', 'assistant.nextAction']) {
      expect(forfait.EXEMPT.has(path) || forfait.ACCOUNT.has(path)).toBe(false);
    }
    expect((await call('assistant.status', user, reader(false), undefined)).status).toBe(402);
    expect((await call('assistant.status', user, reader(false, { [teamId]: false }), { teamId })).status).toBe(402);
    expect((await call('assistant.status', user, reader(true), { teamId })).status).toBe(403);
  });

  test('write and nextAction need one entitled scope, and a named team must have access', async () => {
    const input = { companyId: 'c1' };
    expect((await call('assistant.nextAction', user, reader(false, { [teamId]: false }), input, { mutation: true })).status).toBe(402);
    expect(
      (await call('assistant.nextAction', user, reader(true, { [teamId]: false }), { ...input, teamId }, { mutation: true })).status
    ).toBe(402);
  });
});

describe('targetTeam', () => {
  test('refuses with the personal upgrade URL instead of writing into some team', () => {
    const access = { userId: 'u', actor: null, teamIds: ['t1'], personal: false, upgradeUrl: 'https://sso.test/spaces' };
    try {
      targetTeam(access, undefined);
      throw new Error('expected a refusal');
    } catch (error) {
      expect(error).toMatchObject({ code: 'PAYMENT_REQUIRED' });
      expect(forfait.upgradeUrlOf(error as { cause?: unknown })).toBe('https://sso.test/spaces');
    }
    expect(targetTeam({ ...access, defaultTeamId: 't1' }, undefined)).toBe('t1');
    expect(targetTeam(access, 't1')).toBe('t1');
  });
});

describe('account takeover through the SSO email fallback', () => {
  const db = (user: { id: string; emailVerified: boolean } | null) => ({
    account: { findUnique: async () => null },
    user: { findUnique: async () => user },
  });

  test('an unverified local account with the same email is refused, not linked', async () => {
    await expect(findOidcUser({ email: 'victim@example.com' }, db({ id: 'attacker', emailVerified: false }) as never)).rejects.toBeInstanceOf(
      UnverifiedAccountError
    );
  });

  test('a verified local account still links, and no account means a new user', async () => {
    expect(await findOidcUser({ email: 'v@example.com' }, db({ id: 'legacy', emailVerified: true }) as never)).toEqual({ id: 'legacy' });
    expect(await findOidcUser({ email: 'n@example.com' }, db(null) as never)).toBeNull();
  });

  test('password sign-up and sign-in are refused once OIDC is configured', async () => {
    const anonymous = null as unknown as { id: string; email: string; role: string };
    const input = { email: 'victim@example.com', password: 'Password123!', firstName: 'V', lastName: 'V' };
    const register = await call('auth.register', anonymous, reader(true), input, { mutation: true });
    expect(register.status).toBe(401);
    const login = await call('auth.login', anonymous, reader(true), { email: input.email, password: input.password }, { mutation: true });
    expect(login.status).toBe(403);
    expect(forfait.EXEMPT.has('auth.register')).toBe(false);
  });
});

describe('Registre directory client hardening', () => {
  test('an http issuer is refused in production', () => {
    expect(() => assertSecureIssuer('http://sso.test', true)).toThrow();
    expect(() => assertSecureIssuer('https://sso.test', true)).not.toThrow();
    expect(() => assertSecureIssuer('http://localhost:8080', false)).not.toThrow();
  });

  test('the body is counted while streamed and cut past the cap', async () => {
    await expect(readCapped(new Response('x'.repeat(2048)), 1024)).rejects.toThrow('more than 1024 bytes');
    expect(await readCapped(new Response('{"ok":1}'), 1024)).toBe('{"ok":1}');
  });

  test('a redirect is never followed', async () => {
    const server = Bun.serve({ port: 0, fetch: () => Response.redirect('https://elsewhere.test/', 302) });
    try {
      const client = new DirectoryClient(`http://127.0.0.1:${server.port}`, 'id', 'secret');
      await expect(client.snapshot()).rejects.toBeInstanceOf(DirectoryUnavailableError);
    } finally {
      server.stop(true);
    }
  });

  test('the nudge route is rate limited per IP', async () => {
    const routes = createRegistreSyncRoutes({ nudge: () => {} }, nudgeLimiter);
    const ip = `10.0.0.${Math.floor(Math.random() * 200)}`;
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      statuses.push((await routes.request('/api/registre/sync', { method: 'POST', headers: { 'x-forwarded-for': ip } })).status);
    }
    expect(statuses.slice(0, 30).every((status) => status === 202)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});

describe.skipIf(!databaseUrl)('by-id procedures take the scope of their row', () => {
  let prisma: PrismaClient;
  const tag = crypto.randomUUID();
  const rows: Record<string, string> = {};
  let user: { id: string; email: string; role: string };

  beforeAll(async () => {
    prisma = (await import('@repo/database')).prisma;
    const u = await prisma.user.create({ data: { email: `${tag}@x.test`, firstName: 'P', lastName: 'C', password: 'x' } });
    user = { id: u.id, email: u.email, role: 'USER' };
    const unpaid = await prisma.team.create({ data: { name: `unpaid-${tag}` } });
    const paid = await prisma.team.create({ data: { name: `paid-${tag}` } });
    await prisma.teamMember.createMany({
      data: [
        { teamId: unpaid.id, userId: u.id, role: 'MEMBER' },
        { teamId: paid.id, userId: u.id, role: 'MEMBER' },
      ],
    });
    rows.unpaid = unpaid.id;
    rows.paid = paid.id;
    rows.teamLead = (await prisma.lead.create({ data: { userId: u.id, teamId: unpaid.id, domain: `t-${tag}.test` } })).id;
    rows.paidLead = (await prisma.lead.create({ data: { userId: u.id, teamId: paid.id, domain: `q-${tag}.test` } })).id;
    rows.personalLead = (await prisma.lead.create({ data: { userId: u.id, teamId: null, domain: `p-${tag}.test` } })).id;
    rows.teamHunt = (await prisma.huntSession.create({ data: { userId: u.id, teamId: unpaid.id, sources: [] } })).id;
    rows.teamAudit = (await prisma.auditSession.create({ data: { userId: u.id, teamId: unpaid.id } })).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: `${tag}@x.test` } });
    await prisma.team.deleteMany({ where: { id: { in: [rows.unpaid!, rows.paid!] } } });
  }, 60_000);

  const soloInPaidTeam = () => reader(false, { [rows.unpaid!]: false, [rows.paid!]: true });

  test('A: a Pro-personal member cannot act on an unpaid team lead', async () => {
    const a = await call('lead.favorite.toggle', user, reader(true, { [rows.unpaid!]: false, [rows.paid!]: true }), {
      leadId: rows.teamLead,
    }, { prisma, mutation: true });
    expect(a.status).toBe(402);
  });

  test('B: a Solo person cannot act on a personal lead, with or without a stray paid teamId', async () => {
    const plain = await call('lead.favorite.toggle', user, soloInPaidTeam(), { leadId: rows.personalLead }, { prisma, mutation: true });
    const stray = await call(
      'lead.favorite.toggle',
      user,
      soloInPaidTeam(),
      { leadId: rows.personalLead, teamId: rows.paid },
      { prisma, mutation: true }
    );
    expect(plain.status).toBe(402);
    expect(stray.status).toBe(402);
  });

  test('C: a team-only member cannot act on an unpaid team lead by naming a paid team', async () => {
    const c = await call(
      'lead.favorite.toggle',
      user,
      soloInPaidTeam(),
      { leadId: rows.teamLead, teamId: rows.paid },
      { prisma, mutation: true }
    );
    expect(c.status).toBe(402);
  });

  test('a paying team member who is Solo personally can use the team rows', async () => {
    const ok = await call('lead.query.getById', user, soloInPaidTeam(), { leadId: rows.paidLead }, { prisma });
    expect(ok.status).toBe(200);
    const fav = await call('lead.favorite.toggle', user, soloInPaidTeam(), { leadId: rows.paidLead }, { prisma, mutation: true });
    expect(fav.status).not.toBe(402);
  });

  test('every by-id procedure that creates or runs work refuses an unpaid row', async () => {
    const scopes = reader(true, { [rows.unpaid!]: false });
    const cases: Array<[string, unknown, boolean]> = [
      ['lead.favorite.toggle', { leadId: rows.teamLead }, true],
      ['email.sendEmail', { leadId: rows.teamLead, templateId: 'intro', variables: {} }, true],
      ['email.sendToLead', { leadId: rows.teamLead, subject: 'Hello', text: 'Hi' }, true],
      ['lead.hunt.cancel', { huntSessionId: rows.teamHunt }, true],
      ['lead.audit.cancel', { auditSessionId: rows.teamAudit }, true],
    ];
    for (const [path, input, mutation] of cases) {
      const res = await call(path, user, scopes, input, { prisma, mutation });
      expect({ path, status: res.status }).toEqual({ path, status: 402 });
    }
  });

  test('without any plan, a member still reads, exports and deletes existing data', async () => {
    const none = reader(false, { [rows.unpaid!]: false, [rows.paid!]: false });
    const reads: Array<[string, unknown]> = [
      ['lead.query.getById', { leadId: rows.teamLead }],
      ['lead.query.getById', { leadId: rows.personalLead }],
      ['lead.query.list', {}],
      ['lead.query.list', { teamId: rows.unpaid }],
      ['lead.query.getStats', { teamId: rows.unpaid }],
      ['lead.favorite.isFavorite', { leadId: rows.teamLead }],
      ['lead.importExport.exportToCsv', { teamId: rows.unpaid }],
      ['lead.hunt.list', { teamId: rows.unpaid }],
      ['lead.hunt.getStatus', { huntSessionId: rows.teamHunt }],
      ['lead.hunt.getRunDetails', { huntSessionId: rows.teamHunt }],
      ['contact.listCompanies', { teamId: rows.unpaid }],
      ['contact.listCompanies', {}],
      ['team.get', { teamId: rows.unpaid }],
      ['team.getMembers', { teamId: rows.unpaid }],
    ];
    for (const [path, input] of reads) {
      const res = await call(path, user, none, input, { prisma });
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
    const deleted = await call('lead.query.delete', user, none, { leadId: rows.personalLead }, { prisma, mutation: true });
    expect(deleted.status).toBe(200);
    expect(await prisma.lead.count({ where: { id: rows.personalLead } })).toBe(0);
  });

  test('without a plan, creating, hunting, auditing and outreach stay refused', async () => {
    const none = reader(false, { [rows.unpaid!]: false });
    const writes: Array<[string, unknown]> = [
      ['contact.createCompany', { name: 'Acme', teamId: rows.unpaid }],
      ['lead.hunt.startLocalBusiness', { teamId: rows.unpaid, location: 'Paris', categories: ['restaurant'] }],
      ['lead.audit.start', { teamId: rows.unpaid }],
      ['email.sendToLead', { leadId: rows.teamLead, subject: 'Hello', text: 'Hi' }],
    ];
    for (const [path, input] of writes) {
      const res = await call(path, user, none, input, { prisma, mutation: true });
      expect({ path, status: res.status }).toEqual({ path, status: 402 });
    }
  });

  test('free procedures still refuse a team the caller does not belong to', async () => {
    const outsider = await prisma.team.create({ data: { name: `outsider-${tag}` } });
    try {
      const res = await call('lead.query.list', user, reader(true), { teamId: outsider.id }, { prisma });
      expect(res.status).toBe(403);
    } finally {
      await prisma.team.delete({ where: { id: outsider.id } });
    }
  });

  test("someone else's personal row reads as not found", async () => {
    const other = await prisma.user.create({ data: { email: `other-${tag}@x.test`, firstName: 'O', lastName: 'O', password: 'x' } });
    try {
      const res = await call('lead.query.getById', { id: other.id, email: other.email, role: 'USER' }, reader(true), {
        leadId: rows.personalLead,
      }, { prisma });
      expect(res.status).toBe(404);
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });
});
