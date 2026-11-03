import { describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';
import type { SessionUser } from '@repo/auth';
import type { DelegatedPrincipal } from '@repo/trpc';

/**
 * The scope tests run without a database. The flow test needs
 * TEST_DATABASE_URL pointing at a throwaway database with the current schema
 * pushed; without it that test skips and says so.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';
process.env.DOMAIN ??= 'http://localhost:3000';
process.env.ENCRYPTION_SECRET ??= 'test-encryption-secret-at-least-32-chars';

const { createAgentRoutes } = await import('./agent');

const alice: SessionUser = {
  id: 'agent-test-alice',
  email: 'agent-test-alice@example.com',
  firstName: 'Alice',
  lastName: 'A',
  role: 'USER' as SessionUser['role'],
  isPremium: false,
};

function principal(scopes: string[]): DelegatedPrincipal {
  return { user: alice, actor: 'bulle', subject: 'sub-alice', scopes };
}

const tokens: Record<string, DelegatedPrincipal> = {
  'read-only': principal(['glouton.read']),
  'write-only': principal(['glouton.write']),
  'read-write': principal(['glouton.read', 'glouton.write']),
};

const emptyPrisma = {
  teamMember: { findMany: async () => [] },
  company: { findMany: async () => [], count: async () => 0 },
  person: { findMany: async () => [], count: async () => 0 },
  emailOutreach: { groupBy: async () => [] },
};

function app(prisma: unknown = emptyPrisma) {
  return createAgentRoutes({
    prisma: prisma as PrismaClient,
    verifySession: async (t) => (t === 'session' ? alice : null),
    verifyDelegated: async (t) => tokens[t] ?? null,
  });
}

function call(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return app().request(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

describe('agent API scopes', () => {
  test('refuses a request without a token', async () => {
    const res = await call('GET', '/contacts');
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  test('refuses an unknown token', async () => {
    expect((await call('GET', '/contacts', 'forged')).status).toBe(401);
  });

  test('a read-only token cannot write', async () => {
    for (const [method, path] of [
      ['POST', '/companies'],
      ['PATCH', '/companies/x'],
      ['POST', '/people'],
      ['PATCH', '/people/x'],
      ['POST', '/drafts'],
      ['PATCH', '/drafts/x'],
      ['POST', '/suggestions'],
    ]) {
      const res = await call(method!, path!, 'read-only', { name: 'Acme' });
      expect(res.status).toBe(403);
    }
  });

  test('a write-only token cannot read', async () => {
    for (const path of ['/contacts', '/companies/x', '/people/x', '/outreach', '/suggestions']) {
      expect((await call('GET', path, 'write-only')).status).toBe(403);
    }
  });

  test('a delegated read token and a session JWT can list contacts', async () => {
    for (const token of ['read-only', 'session']) {
      const res = await call('GET', '/contacts', token);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: [] });
    }
  });

  test('no route can send mail', async () => {
    const paths = app().routes.map((r) => r.path);
    expect(paths.some((p) => /send|deliver|outbox/i.test(p))).toBe(false);
    for (const path of ['/drafts/x/send', '/send', '/drafts/send', '/outreach/send']) {
      const res = await call('POST', path, 'read-write', {});
      expect(res.status).toBe(404);
    }
  });

  test('rejects an invalid body with a validation error', async () => {
    const res = await call('POST', '/companies', 'read-write', { name: '' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('VALIDATION');
  });
});

describe.skipIf(!databaseUrl)('agent API flow (database)', () => {
  test('creates a company, a draft and a suggestion, and never sends', async () => {
    const { prisma } = await import('@repo/database/prisma');
    const { inboxService, accessForUser } = await import('@repo/trpc');
    await prisma.user.deleteMany({ where: { id: alice.id } });
    await prisma.user.create({
      data: { id: alice.id, email: alice.email, firstName: 'Alice', lastName: 'A', password: 'x' },
    });
    const api = app(prisma);
    const send = (method: string, path: string, body?: unknown) =>
      api.request(path, {
        method,
        headers: { authorization: 'Bearer read-write', 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });

    const created = await send('POST', '/companies', {
      name: 'Acme',
      domain: 'https://www.Acme.io/about',
      people: [{ firstName: 'Jane', email: 'Jane@Acme.io', role: 'CTO' }],
    });
    expect(created.status).toBe(201);
    const company = ((await created.json()) as { data: { id: string; domain: string; origin: string; people: Array<{ id: string; email: string }> } }).data;
    expect(company.domain).toBe('acme.io');
    expect(company.origin).toBe('AGENT');
    expect(company.people[0]!.email).toBe('jane@acme.io');

    const draftRes = await send('POST', '/drafts', {
      personId: company.people[0]!.id,
      subject: 'Hello',
      text: 'Hi Jane,\n\nShall we talk?',
      rationale: 'Warm lead',
    });
    expect(draftRes.status).toBe(201);
    const draft = ((await draftRes.json()) as { data: { id: string; status: string; origin: string } }).data;
    expect(draft.status).toBe('DRAFT');
    expect(draft.origin).toBe('AGENT');

    const patched = await send('PATCH', `/drafts/${draft.id}`, { subject: 'Hello again' });
    expect(patched.status).toBe(200);

    const suggestionRes = await send('POST', '/suggestions', {
      kind: 'RESCORE',
      title: 'Raise Acme',
      companyId: company.id,
      payload: { temperature: 'HOT', score: 90 },
    });
    expect(suggestionRes.status).toBe(201);
    const suggestion = ((await suggestionRes.json()) as { data: { id: string; createdBy: string } }).data;
    expect(suggestion.createdBy).toBe('bulle');

    const open = (await (await send('GET', '/suggestions')).json()) as { data: Array<{ id: string }> };
    expect(open.data.map((s) => s.id)).toContain(suggestion.id);

    const human = await accessForUser(prisma, alice.id, null);
    await inboxService.decideSuggestion(prisma, human, suggestion.id, 'ACCEPT');
    const rescored = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(rescored.temperature).toBe('HOT');
    expect(rescored.score).toBe(90);

    const agent = await accessForUser(prisma, alice.id, 'bulle');
    await expect(inboxService.sendDraft(prisma, {} as never, agent, draft.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const stored = await prisma.emailOutreach.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored.status).toBe('DRAFT');
    expect(stored.subject).toBe('Hello again');

    const detail = (await (await send('GET', `/companies/${company.id}`)).json()) as {
      data: { people: unknown[]; activities: Array<{ kind: string }>; websiteAudit?: unknown };
    };
    expect(detail.data.people).toHaveLength(1);
    expect(detail.data.websiteAudit).toBeUndefined();

    await prisma.user.delete({ where: { id: alice.id } });
  });
});
