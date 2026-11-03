import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';
import {
  COURRIER_AUDIENCE,
  CourrierClient,
  CourrierReconnectError,
  type CourrierMessage,
  type RefreshTokenStore,
} from '@repo/courrier';

/**
 * The token chain and transport tests run against in-process fakes of
 * Registre and Courrier. The reply sync and import tests need
 * TEST_DATABASE_URL pointing at a throwaway, fully migrated database; without
 * it they skip and say so.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';
process.env.DOMAIN ??= 'http://localhost:3000';
process.env.ENCRYPTION_SECRET ??= 'test-encryption-secret-at-least-32-chars';

const { pickTransport, sendOutreach } = (await import('@repo/trpc')).mailTransport;
const { syncReplies, suggestImports } = await import('@repo/jobs/workers');

if (!databaseUrl) console.warn('[courrier.test] TEST_DATABASE_URL unset: skipping the reply sync and import DB tests');

const CLIENT_ID = 'glouton-client';
const CLIENT_SECRET = 'glouton-secret';

interface FakeState {
  refreshToken: string;
  registreTokens: Set<string>;
  courrierTokens: Set<string>;
  refreshes: number;
  exchanges: number;
  sent: unknown[];
  exchangeForms: URLSearchParams[];
}

function fakeServers() {
  const state: FakeState = {
    refreshToken: 'rt-1',
    registreTokens: new Set(),
    courrierTokens: new Set(),
    refreshes: 0,
    exchanges: 0,
    sent: [],
    exchangeForms: [],
  };
  const expectedBasic = `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`;

  const registre = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/.well-known/openid-configuration') {
        return Response.json({ token_endpoint: `${url.origin}/oauth/token` });
      }
      if (url.pathname !== '/oauth/token') return new Response('not found', { status: 404 });
      if (req.headers.get('authorization') !== expectedBasic) {
        return Response.json({ error: 'invalid_client' }, { status: 401 });
      }
      const form = new URLSearchParams(await req.text());
      if (form.get('grant_type') === 'refresh_token') {
        if (form.get('refresh_token') !== state.refreshToken) {
          return Response.json({ error: 'invalid_grant' }, { status: 400 });
        }
        state.refreshes++;
        state.refreshToken = `rt-${state.refreshes + 1}`;
        const access = `registre-at-${state.refreshes}`;
        state.registreTokens.add(access);
        return Response.json({ access_token: access, refresh_token: state.refreshToken, expires_in: 300 });
      }
      if (form.get('grant_type') === 'urn:ietf:params:oauth:grant-type:token-exchange') {
        state.exchangeForms.push(form);
        if (!state.registreTokens.has(form.get('subject_token') ?? '')) {
          return Response.json({ error: 'invalid_grant' }, { status: 400 });
        }
        if (form.get('audience') !== COURRIER_AUDIENCE) {
          return Response.json({ error: 'invalid_target' }, { status: 400 });
        }
        state.exchanges++;
        const access = `courrier-at-${state.exchanges}`;
        state.courrierTokens.add(access);
        return Response.json({ access_token: access, expires_in: 300, token_type: 'Bearer' });
      }
      return Response.json({ error: 'unsupported_grant_type' }, { status: 400 });
    },
  });

  const courrier = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const bearer = req.headers.get('authorization')?.replace('Bearer ', '') ?? '';
      if (!state.courrierTokens.has(bearer)) {
        return Response.json({ error: { code: 'unauthorized', message: 'no' } }, { status: 401 });
      }
      if (url.pathname === '/api/accounts') {
        return Response.json({
          accounts: [
            { id: 7, name: 'Work', email: 'me@work.test', is_default: true, imap_host: 'x' },
            { id: 8, name: 'Perso', email: 'me@home.test', is_default: false },
          ],
        });
      }
      if (url.pathname === '/api/accounts/7/mail/send' && req.method === 'POST') {
        state.sent.push(await req.json());
        return Response.json({ sent: true });
      }
      if (url.pathname === '/api/accounts/7/mail/search') {
        return Response.json({
          emails: [
            { id: 1, message_id: '<a>', from_address: 'Lead@Acme.test', subject: 'Re: hi', date: '2026-10-02T10:00:00Z' },
            { id: 2, message_id: '<b>', from_address: 'lead@acme.test', subject: 'old', date: '2026-09-01T10:00:00Z' },
            { id: 3, message_id: '<c>', from_address: 'other@acme.test', subject: 'cc', date: '2026-10-03T10:00:00Z' },
          ],
          total: 3,
        });
      }
      if (url.pathname === '/api/accounts/9/mail/send') {
        return Response.json({ error: { code: 'not_found', message: 'account not found' } }, { status: 404 });
      }
      if (url.pathname === '/api/mail/contacts') {
        const page = Number(url.searchParams.get('page'));
        const rows = Array.from({ length: page === 1 ? 100 : 20 }, (_, i) => ({
          email: `c${page}-${i}@x.test`,
          name: 'Jane Doe',
          sent_count: 2,
          last_sent_at: '2026-10-01T00:00:00Z',
        }));
        return Response.json({ contacts: rows, total: 120, page, limit: 100 });
      }
      return new Response('not found', { status: 404 });
    },
  });

  return { state, registre, courrier };
}

function memoryStore(state: FakeState, initial: string | null = 'rt-1') {
  const saved: string[] = [];
  let current = initial;
  const store: RefreshTokenStore = {
    load: async () => current,
    save: async (_userId, token) => {
      current = token;
      saved.push(token);
    },
  };
  return { store, saved, current: () => current, state };
}

describe('Courrier token chain', () => {
  const servers = fakeServers();
  let clock = Date.parse('2026-11-01T00:00:00Z');
  const memory = memoryStore(servers.state);
  const client = new CourrierClient({
    courrierUrl: `http://localhost:${servers.courrier.port}/`,
    issuer: `http://localhost:${servers.registre.port}`,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    store: memory.store,
    now: () => clock,
  });

  afterAll(() => {
    servers.registre.stop(true);
    servers.courrier.stop(true);
  });

  test('refreshes, exchanges for the Courrier audience and persists the rotated refresh token', async () => {
    const accounts = await client.listAccounts('u1');
    expect(accounts).toEqual([
      { id: 7, name: 'Work', email: 'me@work.test', isDefault: true },
      { id: 8, name: 'Perso', email: 'me@home.test', isDefault: false },
    ]);
    expect(servers.state.refreshes).toBe(1);
    expect(servers.state.exchanges).toBe(1);
    expect(memory.saved).toEqual(['rt-2']);
    const form = servers.state.exchangeForms[0]!;
    expect(form.get('subject_token_type')).toBe('urn:ietf:params:oauth:token-type:access_token');
    expect(form.get('scope')).toBe('courrier.read courrier.write');
  });

  test('reuses the cached token, and concurrent callers share one refresh', async () => {
    await Promise.all([client.listAccounts('u1'), client.listAccounts('u1'), client.listAccounts('u1')]);
    expect(servers.state.refreshes).toBe(1);
    expect(servers.state.exchanges).toBe(1);
    clock += 280_000;
    await Promise.all([client.listAccounts('u1'), client.listAccounts('u1')]);
    expect(servers.state.refreshes).toBe(2);
    expect(servers.state.exchanges).toBe(2);
    expect(memory.current()).toBe('rt-3');
  });

  test('sends with the JSON field names Courrier reads', async () => {
    await client.send('u1', 7, { to: ['lead@acme.test'], subject: 'Hello', text: 'Hi', html: '<p>Hi</p>' });
    expect(servers.state.sent.at(-1)).toEqual({
      to: ['lead@acme.test'],
      subject: 'Hello',
      body: 'Hi',
      body_html: '<p>Hi</p>',
    });
  });

  test('surfaces the Courrier error message', async () => {
    await expect(client.send('u1', 9, { to: ['a@b.test'], subject: 's', text: 't' })).rejects.toThrow(
      'Courrier: account not found'
    );
  });

  test('searchFrom keeps mail from that address after the date, oldest first', async () => {
    const found = await client.searchFrom('u1', 7, 'LEAD@acme.test', new Date('2026-09-15T00:00:00Z'));
    expect(found.map((m) => m.messageId)).toEqual(['<a>']);
  });

  test('listContacts walks every page', async () => {
    const contacts = await client.listContacts('u1');
    expect(contacts).toHaveLength(120);
    expect(contacts[0]).toMatchObject({ email: 'c1-0@x.test', name: 'Jane Doe', sentCount: 2 });
  });

  test('asks to reconnect without a refresh token, or when Registre refuses it', async () => {
    const empty = new CourrierClient({
      courrierUrl: `http://localhost:${servers.courrier.port}`,
      issuer: `http://localhost:${servers.registre.port}`,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      store: memoryStore(servers.state, null).store,
    });
    await expect(empty.listAccounts('u2')).rejects.toBeInstanceOf(CourrierReconnectError);
    const stale = new CourrierClient({
      courrierUrl: `http://localhost:${servers.courrier.port}`,
      issuer: `http://localhost:${servers.registre.port}`,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      store: memoryStore(servers.state, 'rt-spent').store,
    });
    await expect(stale.listAccounts('u3')).rejects.toThrow('Reconnect your Facile account');
  });
});

describe('transport selection', () => {
  const courrier = { mailTransport: 'COURRIER', courrierAccountId: 7 };
  const smtp = { mailTransport: 'SMTP', courrierAccountId: null };
  const unset = { mailTransport: null, courrierAccountId: null };

  test('the team choice wins, else the user choice, else SMTP', () => {
    expect(pickTransport(courrier, smtp, true)).toEqual({ kind: 'courrier', accountId: 7 });
    expect(pickTransport(smtp, courrier, true)).toEqual({ kind: 'smtp' });
    expect(pickTransport(unset, courrier, true)).toEqual({ kind: 'courrier', accountId: 7 });
    expect(pickTransport(null, unset, true)).toEqual({ kind: 'smtp' });
  });

  test('Courrier without an account or without the integration falls back to SMTP', () => {
    expect(pickTransport(null, { mailTransport: 'COURRIER', courrierAccountId: null }, true)).toEqual({ kind: 'smtp' });
    expect(pickTransport(null, courrier, false)).toEqual({ kind: 'smtp' });
  });

  function fakePrisma(user: { mailTransport: string | null; courrierAccountId: number | null }) {
    return {
      team: { findUnique: async () => null },
      user: { findUnique: async () => user },
      $queryRaw: async () => [],
    } as unknown as PrismaClient;
  }

  const mail = { to: 'lead@acme.test', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' };
  const scope = { type: 'personal' as const, userId: 'u1' };

  test('sendOutreach hands the HTML to Courrier when the scope picked it', async () => {
    const sent: unknown[] = [];
    const fake = { send: async (...args: unknown[]) => void sent.push(args) } as unknown as CourrierClient;
    const result = await sendOutreach({ prisma: fakePrisma(courrier), auth: {} as never, scope, mail, courrier: fake });
    expect(result).toEqual({ transport: 'courrier', courrierAccountId: 7 });
    expect(sent).toEqual([['u1', 7, { to: ['lead@acme.test'], subject: 'Hello', text: 'Hi', html: '<p>Hi</p>' }]]);
  });

  test('sendOutreach goes to SMTP when Courrier is not configured', async () => {
    const prisma = {
      ...fakePrisma(courrier),
      user: { findUnique: async () => courrier, findFirst: async () => null },
    } as unknown as PrismaClient;
    await expect(sendOutreach({ prisma, auth: {} as never, scope, mail, courrier: null })).rejects.toThrow(
      'SMTP configuration not found'
    );
  });
});

describe.skipIf(!databaseUrl)('Courrier jobs against the database', () => {
  let prisma: PrismaClient;
  const userId = `courrier-test-${crypto.randomUUID()}`;
  const otherId = `courrier-test-${crypto.randomUUID()}`;

  beforeAll(async () => {
    prisma = (await import('@repo/database')).prisma as unknown as PrismaClient;
    for (const id of [userId, otherId]) {
      await prisma.user.create({
        data: { id, email: `${id}@glouton.test`, firstName: 'T', lastName: 'T', password: 'x', mailTransport: 'COURRIER', courrierAccountId: 7 },
      });
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  });

  async function outreach(owner: string, email: string, sentAt: Date) {
    const company = await prisma.company.create({ data: { userId: owner, name: 'Acme', origin: 'MANUAL' } });
    const person = await prisma.person.create({
      data: { userId: owner, companyId: company.id, email, origin: 'MANUAL' },
    });
    const row = await prisma.emailOutreach.create({
      data: {
        userId: owner,
        personId: person.id,
        companyId: company.id,
        subject: 'Hello',
        htmlBody: '<p>Hi</p>',
        textBody: 'Hi',
        variables: {},
        status: 'SENT',
        sentAt,
        courrierAccountId: 7,
      },
    });
    return { company, person, row };
  }

  test('reply sync marks only outreach answered after it was sent, and survives a failing user', async () => {
    const now = new Date('2026-11-01T00:00:00Z');
    const answered = await outreach(userId, 'lead@acme.test', new Date('2026-10-10T00:00:00Z'));
    const unanswered = await outreach(userId, 'quiet@acme.test', new Date('2026-10-15T00:00:00Z'));
    await outreach(otherId, 'lead@acme.test', new Date('2026-10-10T00:00:00Z'));

    const replies: Record<string, CourrierMessage[]> = {
      'lead@acme.test': [
        { id: 1, messageId: '<old>', fromAddress: 'lead@acme.test', subject: 'old', date: new Date('2026-10-05T00:00:00Z') },
        { id: 2, messageId: '<re>', fromAddress: 'lead@acme.test', subject: 'Re: Hello', date: new Date('2026-10-12T00:00:00Z') },
      ],
      'quiet@acme.test': [
        { id: 3, messageId: '<x>', fromAddress: 'quiet@acme.test', subject: 'before', date: new Date('2026-10-14T00:00:00Z') },
      ],
    };
    const source = {
      searchFrom: async (owner: string, _account: number, email: string) => {
        if (owner === otherId) throw new Error('Courrier down');
        return replies[email] ?? [];
      },
    };

    const result = await syncReplies(prisma, source, now);
    expect(result.replied).toBe(1);
    expect(result.failedUsers).toBe(1);

    const done = await prisma.emailOutreach.findUniqueOrThrow({ where: { id: answered.row.id } });
    expect(done.status).toBe('REPLIED');
    expect(done.repliedAt?.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect((await prisma.person.findUniqueOrThrow({ where: { id: answered.person.id } })).stage).toBe('CONTACTED');
    expect((await prisma.company.findUniqueOrThrow({ where: { id: answered.company.id } })).stage).toBe('CONTACTED');
    const activity = await prisma.activity.findFirstOrThrow({ where: { personId: answered.person.id, kind: 'email.replied' } });
    expect(activity.actor).toBe('courrier-sync');
    expect((await prisma.emailOutreach.findUniqueOrThrow({ where: { id: unanswered.row.id } })).status).toBe('SENT');

    expect((await syncReplies(prisma, source, now)).replied).toBe(0);
  });

  test('contact import skips known people and already proposed addresses', async () => {
    await prisma.person.create({ data: { userId, email: 'known@x.test', origin: 'MANUAL' } });
    await prisma.suggestion.create({
      data: { userId, kind: 'IMPORT', title: 'p', payload: { email: 'proposed@x.test' }, createdBy: 'test' },
    });
    const contacts = ['Known@x.test', 'proposed@x.test', 'new@x.test', 'NEW@x.test', `${userId}@glouton.test`].map(
      (email) => ({ email, name: 'Jane Van Doe', sentCount: 3, lastSentAt: null })
    );

    expect(await suggestImports(prisma, userId, contacts)).toBe(1);
    const created = await prisma.suggestion.findFirstOrThrow({ where: { userId, createdBy: 'courrier-import' } });
    expect(created.kind).toBe('IMPORT');
    expect(created.payload).toMatchObject({ email: 'new@x.test', firstName: 'Jane', lastName: 'Van Doe', origin: 'COURRIER' });
    expect(await suggestImports(prisma, userId, contacts)).toBe(0);
  });
});
