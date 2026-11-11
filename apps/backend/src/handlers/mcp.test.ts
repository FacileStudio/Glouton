import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';

/**
 * Glouton's MCP server against the tronc-ts conformance kit. The protocol
 * checks run without a database; the tool, confirmation and confirm page
 * tests need TEST_DATABASE_URL pointing at a throwaway, migrated database.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';
process.env.DOMAIN ??= 'http://localhost:3000';
process.env.ENCRYPTION_SECRET ??= 'test-encryption-secret-at-least-32-chars';

const { Hono } = await import('hono');
const { registreVerifier } = await import('@facile/tronc/mcp');
const { call, connect, decode, newIssuer, run, text } = await import('@facile/tronc/mcp/mcptest');
const { prisma } = await import('@repo/database');
const { gloutonMcp } = await import('./mcp');

const db = prisma as PrismaClient;
const issuer = await newIssuer();
const ids = { user: 'mcp-test-no-db', other: '' };
const deletions = new Map<string, number>();
const audit = {
  info: (fields: Record<string, unknown>) => {
    if (fields.outcome === 'done' && typeof fields.target === 'string') {
      deletions.set(fields.target, (deletions.get(fields.target) ?? 0) + 1);
    }
  },
};

const app = new Hono();
const http = Bun.serve({ port: 0, fetch: (request) => app.fetch(request) });
const resource = `http://127.0.0.1:${http.port}/mcp`;
const mcp = gloutonMcp({
  prisma: db,
  inboxUrl: 'https://glouton.test/app/messages/inbox',
  resource,
  issuer: issuer.url,
  verifier: await registreVerifier({
    issuer: issuer.url,
    resource,
    scopePrefix: 'glouton',
    resolveUser: async (claims) => (claims.subject === 'person' ? ids.user : undefined),
  }),
  version: '0.0.0',
  confirmKey: 'a-test-confirm-key-of-at-least-32-bytes',
  confirmUrl: 'https://glouton.test/app/pending',
  audit,
  rateLimit: { rate: 1000, burst: 1000 },
  onError: (err, tool) => console.error(`mcp test: ${tool} failed`, err),
});
mcp.server.mount(app);

const token = (...scopes: string[]) =>
  issuer.token(resource, 'person', ...(scopes.length ? scopes : ['glouton.read', 'glouton.write']));

afterAll(() => {
  http.stop(true);
  issuer.close();
});

async function company(name: string, userId = ids.user) {
  return db.company.create({ data: { name, userId, origin: 'MANUAL', emails: [], phones: [], technologies: [] } });
}

if (databaseUrl) {
  beforeAll(async () => {
    await db.user.deleteMany({ where: { email: { endsWith: '@mcp.test' } } });
    const user = await db.user.create({ data: { email: 'person@mcp.test', firstName: 'P', lastName: 'T', password: 'x' } });
    const other = await db.user.create({ data: { email: 'other@mcp.test', firstName: 'O', lastName: 'T', password: 'x' } });
    ids.user = user.id;
    ids.other = other.id;
  });
  afterAll(async () => {
    await db.mcpAction.deleteMany({ where: { userId: { in: [ids.user, ids.other] } } });
    await db.user.deleteMany({ where: { email: { endsWith: '@mcp.test' } } });
  });
}

let next = 0;
const deleteCase = (tool: string, kind: 'company' | 'person') => ({
  tool,
  setup: async () => {
    const row = await company(`Conformance ${next++}`);
    const target = kind === 'company'
      ? row.id
      : (await db.person.create({ data: { userId: ids.user, companyId: row.id, firstName: 'C', origin: 'MANUAL', emails: [] } })).id;
    return { args: { [`${kind}_id`]: target }, runs: () => deletions.get(target) ?? 0 };
  },
});

run({
  url: resource,
  token,
  confirm: databaseUrl ? [deleteCase('glouton_company_delete', 'company'), deleteCase('glouton_person_delete', 'person')] : [],
});

describe('the tool list', () => {
  test('carries the twelve contact tools and the two confirmed deletes', async () => {
    const client = await connect(resource, await token());
    const { tools } = await client.listTools();
    await client.close();
    expect(tools.map((t) => t.name)).toEqual([
      'glouton_company_create', 'glouton_company_delete', 'glouton_company_get', 'glouton_company_update',
      'glouton_contacts_search', 'glouton_draft_save', 'glouton_draft_update', 'glouton_outreach_list',
      'glouton_person_create', 'glouton_person_delete', 'glouton_person_get', 'glouton_person_update',
      'glouton_suggestion_create', 'glouton_suggestions_list',
    ]);
  });
});

describe.skipIf(!databaseUrl)('the tools against the database', () => {
  async function tool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const client = await connect(resource, await token());
    try {
      return decode<T>(await call(client, name, args));
    } finally {
      await client.close();
    }
  }

  async function refusal(name: string, args: Record<string, unknown>): Promise<string> {
    const client = await connect(resource, await token());
    try {
      const result = await call(client, name, args);
      expect(result.isError).toBe(true);
      return text(result);
    } finally {
      await client.close();
    }
  }

  test('a person without any plan creates, finds, updates and reads their contacts', async () => {
    await db.forfaitState.upsert({ where: { id: 1 }, create: { issuer: 'x', version: 1n, revision: 1n }, update: {} });
    const created = await tool<{ company: { id: string; people: Array<{ id: string }> } }>('glouton_company_create', {
      name: 'Acme MCP', domain: 'https://www.acme-mcp.test/', people: [{ first_name: 'Ada', email: 'ada@acme-mcp.test' }],
    });
    const found = await tool<{ contacts: Array<{ id: string; type: string }> }>('glouton_contacts_search', { query: 'acme-mcp' });
    expect(found.contacts.map((c) => c.id)).toContain(created.company.id);

    const updated = await tool<{ company: { temperature: string; domain: string } }>('glouton_company_update', {
      company_id: created.company.id, temperature: 'HOT',
    });
    expect(updated.company).toMatchObject({ temperature: 'HOT', domain: 'acme-mcp.test' });

    const read = await tool<{ company: { people: Array<{ first_name: string }> } }>('glouton_company_get', { company_id: created.company.id });
    expect(read.company.people.map((p) => p.first_name)).toEqual(['Ada']);

    const personId = created.company.people[0]!.id;
    const person = await tool<{ person: { role: string } }>('glouton_person_update', { person_id: personId, role: 'CTO' });
    expect(person.person.role).toBe('CTO');
    await db.forfaitState.deleteMany();
  });

  test('a draft and a suggestion wait in the inbox and never send', async () => {
    const row = await company('Inbox MCP');
    const person = await tool<{ person: { id: string } }>('glouton_person_create', { company_id: row.id, email: 'bob@inbox-mcp.test' });
    const draft = await tool<{ draft: { id: string; status: string }; inbox_url: string }>('glouton_draft_save', {
      person_id: person.person.id, subject: 'Hello', text: 'Hi Bob',
    });
    expect(draft.draft.status).toBe('DRAFT');
    await tool('glouton_draft_update', { draft_id: draft.draft.id, subject: 'Hello again' });
    const outreach = await tool<{ outreach: Array<{ subject: string; origin: string }> }>('glouton_outreach_list', { person_id: person.person.id });
    expect(outreach.outreach).toEqual([expect.objectContaining({ subject: 'Hello again', origin: 'AGENT' })]);

    await tool('glouton_suggestion_create', { kind: 'RESCORE', title: 'Warm up', company_id: row.id, temperature: 'WARM' });
    const open = await tool<{ suggestions: Array<{ title: string }> }>('glouton_suggestions_list', {});
    expect(open.suggestions.map((s) => s.title)).toContain('Warm up');
  });

  test("another person's company is not found, with a hint", async () => {
    const theirs = await company('Not yours', ids.other);
    expect(await refusal('glouton_company_get', { company_id: theirs.id })).toContain('glouton_contacts_search');
    expect(await refusal('glouton_company_delete', { company_id: theirs.id })).toContain('not found');
  });

  test('a bad argument comes back in snake case', async () => {
    expect(await refusal('glouton_person_create', { email: 'x@y.test', first_name: 'x'.repeat(200) })).toContain('first_name');
  });

  test('the confirm page lists, confirms once and dismisses pending deletes', async () => {
    const row = await company('Pending MCP');
    const out = await tool<{ status: string; confirm_url: string }>('glouton_company_delete', { company_id: row.id });
    const id = new URL(out.confirm_url).searchParams.get('action')!;
    expect((await mcp.pending.open(ids.user)).find((a) => a.id === id)).toMatchObject({ kind: 'delete_company', state: 'ready' });
    await mcp.pending.confirm(ids.user, id);
    expect((await db.company.findUnique({ where: { id: row.id } }))?.deletedAt).not.toBeNull();
    await expect(mcp.pending.confirm(ids.user, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const kept = await company('Kept MCP');
    const second = await tool<{ confirm_url: string }>('glouton_company_delete', { company_id: kept.id });
    const secondId = new URL(second.confirm_url).searchParams.get('action')!;
    await expect(mcp.pending.confirm(ids.other, secondId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await mcp.pending.dismiss(ids.user, secondId);
    expect((await db.company.findUnique({ where: { id: kept.id } }))?.deletedAt).toBeNull();
  });

  test('a company changed after the question is not deleted', async () => {
    const row = await company('Changed MCP');
    const out = await tool<{ confirm_url: string }>('glouton_company_delete', { company_id: row.id });
    const id = new URL(out.confirm_url).searchParams.get('action')!;
    await db.company.update({ where: { id: row.id }, data: { notes: 'edited' } });
    expect((await mcp.pending.open(ids.user)).find((a) => a.id === id)?.state).toBe('changed');
    await expect(mcp.pending.confirm(ids.user, id)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await db.company.findUnique({ where: { id: row.id } }))?.deletedAt).toBeNull();
  });
});
