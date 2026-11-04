import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';

/**
 * Signature and payload tests run without a database. The sync tests need
 * TEST_DATABASE_URL pointing at a throwaway database with the current schema
 * pushed; they truncate User and Team, and skip without it.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';
process.env.DOMAIN ??= 'http://localhost:3000';
process.env.ENCRYPTION_SECRET ??= 'test-encryption-secret-at-least-32-chars';

const { ardoise, accessForUser, contactService, inboxService } = await import('@repo/trpc');
const { createArdoiseRoutes } = await import('./ardoise');

const SECRET = 'ardoise-webhook-secret-for-tests';
const env = {
  ARDOISE_URL: 'http://ardoise.test',
  ARDOISE_API_TOKEN: 'ardoise-token',
  ARDOISE_WEBHOOK_SECRET: SECRET,
  ARDOISE_DEFAULT_OWNER_EMAIL: 'owner@ardoise-test.example',
};
const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

if (!databaseUrl) console.warn('[ardoise.test] TEST_DATABASE_URL unset: skipping the sync DB tests');

type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };
type Reply = { status: number; body: unknown };

function headerMap(init: HeadersInit | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  new Headers(init).forEach((value, key) => {
    map[key] = value;
  });
  return map;
}

function fakeArdoise(handler: (call: Call) => Reply) {
  const calls: Call[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      url: String(input),
      headers: headerMap(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const reply = handler(call);
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  };
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

function fakeJobs() {
  const added: Array<{ name: string; data: Record<string, string> }> = [];
  return {
    added,
    addJob: async <T>(_queue: string, name: string, data: T) => {
      added.push({ name, data: data as Record<string, string> });
      return {} as never;
    },
  };
}

function remoteClient(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ard-1',
    gloutonCompanyId: null,
    registreSpaceId: null,
    companyName: 'Boulangerie Martin',
    contactFirstName: 'Paul',
    contactLastName: 'Martin',
    contactEmail: 'paul@boulangerie-martin.fr',
    billingAddress: '1 rue du Pain',
    billingCity: 'Lyon',
    billingPostalCode: '69001',
    billingCountry: 'France',
    siret: '12345678900011',
    tvaIntracom: 'FR12345678900',
    updatedAt: '2026-11-03T10:00:00.000Z',
    ...overrides,
  };
}

let deliveries = 0;

function signed(event: string, data: unknown, delivery = `delivery-${++deliveries}`) {
  const body = JSON.stringify({ id: delivery, event, occurredAt: new Date().toISOString(), data });
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Ardoise-Event': event,
      'X-Ardoise-Delivery': delivery,
      'X-Ardoise-Signature-256': ardoise.signBody(SECRET, body),
    },
    body,
  };
}

describe('Ardoise signature', () => {
  const body = '{"id":"d1","event":"client.created","data":{}}';

  test('accepts the sha256 HMAC of the raw body', () => {
    expect(ardoise.verifySignature(SECRET, body, ardoise.signBody(SECRET, body))).toBe(true);
  });

  test('rejects a missing, forged or truncated signature', () => {
    expect(ardoise.verifySignature(SECRET, body, undefined)).toBe(false);
    expect(ardoise.verifySignature(SECRET, body, ardoise.signBody('another-secret-value', body))).toBe(false);
    expect(ardoise.verifySignature(SECRET, `${body} `, ardoise.signBody(SECRET, body))).toBe(false);
    expect(ardoise.verifySignature(SECRET, body, 'sha256=00')).toBe(false);
  });

  test('the webhook answers 401 to a bad signature before touching the database', async () => {
    const untouched = new Proxy({}, { get: () => { throw new Error('database touched'); } }) as PrismaClient;
    const routes = createArdoiseRoutes(ardoise.ardoiseDeps(untouched, env, null, silent));
    const request = signed('client.created', remoteClient());
    request.headers['X-Ardoise-Signature-256'] = ardoise.signBody('wrong-secret-value', request.body);
    const res = await routes.request('/webhook', request);
    expect(res.status).toBe(401);
  });

  test('the webhook is inert when Ardoise is not configured', async () => {
    const untouched = {} as PrismaClient;
    const routes = createArdoiseRoutes(ardoise.ardoiseDeps(untouched, {}, null, silent));
    const res = await routes.request('/webhook', signed('client.created', remoteClient()));
    expect(res.status).toBe(404);
  });
});

describe('Ardoise matching helpers', () => {
  test('similar names ignore case, accents, punctuation and legal forms', () => {
    expect(ardoise.similarNames('ACME S.A.S.', 'Acme')).toBe(true);
    expect(ardoise.similarNames('Boulangerie Martin', 'boulangerie martín')).toBe(true);
    expect(ardoise.similarNames('Boulangerie Martin', 'Boulangerie Martine')).toBe(true);
    expect(ardoise.similarNames('Boulangerie Martin', 'Pâtisserie Durand')).toBe(false);
  });

  test('webmail domains say nothing about the company', () => {
    expect(ardoise.companyDomainOf('jane@gmail.com')).toBeNull();
    expect(ardoise.companyDomainOf('Jane@Acme.io')).toBe('acme.io');
  });
});

describe.skipIf(!databaseUrl)('Ardoise sync (database)', () => {
  let db: PrismaClient;
  let ownerId: string;
  let teamId: string;
  let jobs: ReturnType<typeof fakeJobs>;

  function deps(handler: (call: Call) => Reply = () => ({ status: 500, body: {} })) {
    const remote = fakeArdoise(handler);
    return { remote, sync: ardoise.ardoiseDeps(db, env, jobs, silent, remote.fetchImpl) };
  }

  async function deliver(event: string, data: unknown, delivery?: string) {
    const { sync } = deps();
    const res = await createArdoiseRoutes(sync).request('/webhook', signed(event, data, delivery));
    return { status: res.status, body: (await res.json()) as { data?: { outcome: string } } };
  }

  beforeAll(async () => {
    db = (await import('@repo/database')).prisma;
    await db.$executeRawUnsafe('TRUNCATE "User", "Team", "ArdoiseDelivery" CASCADE');
    const owner = await db.user.create({
      data: { email: env.ARDOISE_DEFAULT_OWNER_EMAIL, firstName: 'Owner', lastName: 'O', password: 'x' },
    });
    ownerId = owner.id;
    const team = await db.team.create({
      data: { name: 'Studio', registreSpaceId: 'space-1', members: { create: { userId: ownerId, role: 'OWNER' } } },
    });
    teamId = team.id;
  }, 60_000);

  beforeEach(async () => {
    jobs = fakeJobs();
    for (const table of ['Activity', 'Suggestion', 'Person', 'Company', 'ArdoiseDelivery']) {
      await db.$executeRawUnsafe(`DELETE FROM "${table}"`);
    }
  });

  async function personalCompany(data: Record<string, unknown>) {
    return db.company.create({
      data: { userId: ownerId, name: 'Placeholder', origin: 'MANUAL', phones: [], emails: [], technologies: [], ...data },
    });
  }

  test('a delivery id is processed once', async () => {
    const first = await deliver('client.created', remoteClient(), 'same-delivery');
    const second = await deliver('client.created', remoteClient(), 'same-delivery');
    expect(first.status).toBe(202);
    expect(second.body.data?.outcome).toBe('duplicate');
    expect(await db.company.count()).toBe(1);
  });

  test('an unmatched client is created in the team of its Registre space', async () => {
    const { body } = await deliver('client.created', remoteClient({ registreSpaceId: 'space-1' }));
    expect(body.data?.outcome).toBe('created');
    const company = await db.company.findFirstOrThrow({ include: { people: true } });
    expect(company.teamId).toBe(teamId);
    expect(company.stage).toBe('CLIENT');
    expect(company.origin).toBe('ARDOISE');
    expect(company.ardoiseClientId).toBe('ard-1');
    expect(company.domain).toBe('boulangerie-martin.fr');
    expect(company.people[0]).toMatchObject({ firstName: 'Paul', lastName: 'Martin', isBillingContact: true });
    expect(jobs.added).toEqual([{ name: 'push', data: { companyId: company.id } }]);
  });

  test('an unknown space falls back to the default owner’s personal scope', async () => {
    await deliver('client.created', remoteClient({ registreSpaceId: 'space-unknown' }));
    const company = await db.company.findFirstOrThrow();
    expect(company.teamId).toBeNull();
    expect(company.userId).toBe(ownerId);
  });

  test('without the default owner the event is accepted and nothing is created', async () => {
    await db.user.update({ where: { id: ownerId }, data: { email: 'someone-else@example.com' } });
    const { status, body } = await deliver('client.created', remoteClient());
    await db.user.update({ where: { id: ownerId }, data: { email: env.ARDOISE_DEFAULT_OWNER_EMAIL } });
    expect(status).toBe(202);
    expect(body.data?.outcome).toBe('no_owner');
    expect(await db.company.count()).toBe(0);
  });

  test('the same SIRET links automatically', async () => {
    const existing = await personalCompany({ name: 'Martin & Fils', siret: '123 456 789 00011' });
    await db.company.update({ where: { id: existing.id }, data: { siret: '12345678900011' } });
    const { body } = await deliver('client.created', remoteClient());
    expect(body.data?.outcome).toBe('linked');
    const linked = await db.company.findUniqueOrThrow({ where: { id: existing.id } });
    expect(linked.ardoiseClientId).toBe('ard-1');
    expect(linked.stage).toBe('CLIENT');
    expect(await db.company.count()).toBe(1);
    const activity = await db.activity.findFirstOrThrow({ where: { companyId: existing.id } });
    expect(activity.kind).toBe('ardoise.client.linked');
  });

  test('the same contact email links automatically', async () => {
    const existing = await personalCompany({ name: 'Something else' });
    await db.person.create({
      data: { userId: ownerId, companyId: existing.id, email: 'paul@boulangerie-martin.fr', origin: 'MANUAL', emails: [], phones: [] },
    });
    const { body } = await deliver('client.created', remoteClient({ siret: null }));
    expect(body.data?.outcome).toBe('linked');
    expect((await db.company.findUniqueOrThrow({ where: { id: existing.id } })).ardoiseClientId).toBe('ard-1');
  });

  test('the same domain asks first; accepting links, dismissing creates a company', async () => {
    const existing = await personalCompany({ name: 'BM', domain: 'boulangerie-martin.fr' });
    const client = remoteClient({ siret: null, contactEmail: 'compta@boulangerie-martin.fr' });
    expect((await deliver('client.created', client)).body.data?.outcome).toBe('suggested');
    expect((await deliver('client.updated', { ...client, companyName: 'Boulangerie Martin SARL' })).body.data?.outcome).toBe('pending');
    const suggestions = await db.suggestion.findMany();
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ kind: 'MATCH', status: 'OPEN', companyId: existing.id });
    expect((await db.company.findUniqueOrThrow({ where: { id: existing.id } })).ardoiseClientId).toBeNull();

    const human = await accessForUser(db, ownerId, null);
    const changed: string[] = [];
    await inboxService.decideSuggestion(db, human, suggestions[0]!.id, 'ACCEPT', { companyChanged: (id) => void changed.push(id) });
    const linked = await db.company.findUniqueOrThrow({ where: { id: existing.id } });
    expect(linked.ardoiseClientId).toBe('ard-1');
    expect(linked.name).toBe('Boulangerie Martin SARL');
    expect(changed).toEqual([existing.id]);

    await db.company.update({ where: { id: existing.id }, data: { ardoiseClientId: null } });
    await deliver('client.created', { ...client, id: 'ard-2', contactEmail: 'contact@boulangerie-martin.fr' });
    const second = await db.suggestion.findFirstOrThrow({ where: { status: 'OPEN' } });
    await inboxService.decideSuggestion(db, human, second.id, 'DISMISS');
    const created = await db.company.findFirstOrThrow({ where: { ardoiseClientId: 'ard-2' } });
    expect(created.id).not.toBe(existing.id);
    expect(created.origin).toBe('ARDOISE');
  });

  test('inbound last write wins on updatedAt', async () => {
    const linked = await personalCompany({
      name: 'Kept',
      ardoiseClientId: 'ard-1',
      ardoiseUpdatedAt: new Date('2026-11-03T10:00:00.000Z'),
    });
    const older = await deliver('client.updated', remoteClient({ gloutonCompanyId: linked.id, companyName: 'Older', updatedAt: '2026-11-03T09:00:00.000Z' }));
    expect(older.body.data?.outcome).toBe('skipped');
    expect((await db.company.findUniqueOrThrow({ where: { id: linked.id } })).name).toBe('Kept');

    const newer = await deliver('client.updated', remoteClient({ gloutonCompanyId: linked.id, companyName: 'Newer', updatedAt: '2026-11-03T11:00:00.000Z' }));
    expect(newer.body.data?.outcome).toBe('updated');
    const updated = await db.company.findUniqueOrThrow({ where: { id: linked.id } });
    expect(updated.name).toBe('Newer');
    expect(updated.ardoiseUpdatedAt?.toISOString()).toBe('2026-11-03T11:00:00.000Z');
  });

  test('outbound push PUTs the current state, and pulls when Ardoise is newer', async () => {
    const company = await personalCompany({ name: 'Local', ardoiseClientId: 'ard-1', city: 'Paris' });
    await db.person.create({
      data: { userId: ownerId, companyId: company.id, firstName: 'Ana', lastName: 'Lopez', origin: 'MANUAL', emails: [], phones: [], isBillingContact: true },
    });

    const pushed = deps((call) => ({ status: 200, body: { data: { id: 'ard-1', updatedAt: (call.body as { updatedAt: string }).updatedAt } } }));
    expect(await ardoise.pushCompany(pushed.sync, company.id)).toBe('pushed');
    const put = pushed.remote.calls[0]!;
    expect(put.method).toBe('PUT');
    expect(put.url).toBe('http://ardoise.test/api/integrations/glouton/clients/ard-1');
    expect(put.headers['x-sync-source']).toBe('glouton');
    expect(put.headers.authorization).toBe('Bearer ardoise-token');
    expect(put.body).toMatchObject({ gloutonCompanyId: company.id, companyName: 'Local', contactFirstName: 'Ana', billingCity: 'Paris' });

    const newer = new Date(Date.now() + 60_000).toISOString();
    const pulled = deps((call) =>
      call.method === 'PUT'
        ? { status: 200, body: { data: { id: 'ard-1', updatedAt: newer, skipped: true } } }
        : { status: 200, body: { data: remoteClient({ gloutonCompanyId: company.id, companyName: 'Remote', updatedAt: newer }) } }
    );
    expect(await ardoise.pushCompany(pulled.sync, company.id)).toBe('pulled');
    expect((await db.company.findUniqueOrThrow({ where: { id: company.id } })).name).toBe('Remote');
  });

  test('an unknown space on push is logged as an activity, not retried', async () => {
    const company = await personalCompany({ name: 'Local', ardoiseClientId: 'ard-1', teamId });
    await db.person.create({
      data: { userId: ownerId, teamId, companyId: company.id, firstName: 'Ana', lastName: 'Lopez', origin: 'MANUAL', emails: [], phones: [], isBillingContact: true },
    });
    const { sync } = deps(() => ({ status: 422, body: { error: { code: 'unknown_space', message: 'No Ardoise space' } } }));
    expect(await ardoise.pushCompany(sync, company.id)).toBe('failed');
    const activity = await db.activity.findFirstOrThrow({ where: { companyId: company.id } });
    expect(activity.kind).toBe('ardoise.sync_failed');
    expect(activity.summary).toContain('space-1');
  });

  test('client.deleted only unlinks', async () => {
    const company = await personalCompany({ name: 'Kept', stage: 'CLIENT', ardoiseClientId: 'ard-1' });
    const { body } = await deliver('client.deleted', { id: 'ard-1', gloutonCompanyId: company.id });
    expect(body.data?.outcome).toBe('unlinked');
    const after = await db.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(after.deletedAt).toBeNull();
    expect(after.ardoiseClientId).toBeNull();
    expect(after.stage).toBe('CLIENT');
    expect((await db.activity.findFirstOrThrow({ where: { companyId: company.id } })).kind).toBe('ardoise.client.unlinked');
    expect((await deliver('client.updated', remoteClient({ gloutonCompanyId: null }))).body.data?.outcome).toBe('ignored');
  });

  test('mission events land on the timeline; an accepted quote makes a client', async () => {
    const company = await personalCompany({ name: 'Prospect', stage: 'CONTACTED', ardoiseClientId: 'ard-1' });
    const mission = {
      clientId: 'ard-1',
      missionId: 'm-1',
      missionTitle: 'Site vitrine',
      amountCents: 120000,
      currency: 'EUR',
      documentNumber: 'D-2026-004',
      url: 'https://ardoise.facile.studio/admin/missions/m-1',
    };
    expect((await deliver('mission.quote_accepted', mission)).body.data?.outcome).toBe('recorded');
    expect((await db.company.findUniqueOrThrow({ where: { id: company.id } })).stage).toBe('CLIENT');
    const quote = await db.activity.findFirstOrThrow({ where: { companyId: company.id, kind: 'ardoise.quote_accepted' } });
    expect(quote.summary).toContain('D-2026-004');
    expect(quote.summary).toContain('Site vitrine');
    expect((await deliver('mission.invoice_generated', { ...mission, clientId: 'ard-unknown' })).body.data?.outcome).toBe('ignored');
  });

  test('turn into client needs a first and a last name', async () => {
    const company = await personalCompany({ name: 'Acme' });
    const person = await db.person.create({
      data: { userId: ownerId, companyId: company.id, firstName: 'Jane', origin: 'MANUAL', emails: [], phones: [] },
    });
    const { remote, sync } = deps((call) => ({
      status: 200,
      body: { data: { id: 'ard-9', updatedAt: (call.body as { updatedAt: string }).updatedAt } },
    }));
    const human = await accessForUser(db, ownerId, null);
    const input = { companyId: company.id, billingPersonId: person.id };

    await expect(ardoise.turnIntoClient(sync, human, input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(remote.calls).toHaveLength(0);

    const agent = await accessForUser(db, ownerId, 'bulle');
    await expect(ardoise.turnIntoClient(sync, agent, { ...input, fill: { lastName: 'Doe' } })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const linked = await ardoise.turnIntoClient(sync, human, { ...input, fill: { lastName: 'Doe', city: 'Nantes' } }, 'owner@ardoise-test.example');
    expect(remote.calls[0]).toMatchObject({ method: 'POST', url: 'http://ardoise.test/api/integrations/glouton/clients' });
    expect(remote.calls[0]!.body).toMatchObject({ gloutonCompanyId: company.id, contactLastName: 'Doe', billingCity: 'Nantes', registreSpaceId: null });
    expect(linked).toMatchObject({ stage: 'CLIENT', ardoiseClientId: 'ard-9', city: 'Nantes' });
    expect(await db.person.findUniqueOrThrow({ where: { id: person.id } })).toMatchObject({ lastName: 'Doe', isBillingContact: true });
  });

  test('turn into client reports an unknown space instead of hiding it', async () => {
    const company = await personalCompany({ name: 'Acme', teamId });
    const person = await db.person.create({
      data: { userId: ownerId, teamId, companyId: company.id, firstName: 'Jane', lastName: 'Doe', origin: 'MANUAL', emails: [], phones: [] },
    });
    const { remote, sync } = deps(() => ({ status: 422, body: { error: { code: 'unknown_space', message: 'No Ardoise space' } } }));
    const human = await accessForUser(db, ownerId, null);
    await expect(ardoise.turnIntoClient(sync, human, { companyId: company.id, billingPersonId: person.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(remote.calls).toHaveLength(1);
    expect((remote.calls[0]!.body as { registreSpaceId: string }).registreSpaceId).toBe('space-1');
    expect((await db.company.findUniqueOrThrow({ where: { id: company.id } })).ardoiseClientId).toBeNull();
    expect((await db.activity.findFirstOrThrow({ where: { companyId: company.id } })).kind).toBe('ardoise.sync_failed');
  });

  test('edits of a linked company queue a push; deleting it only unlinks', async () => {
    const company = await personalCompany({ name: 'Linked', ardoiseClientId: 'ard-1' });
    const human = await accessForUser(db, ownerId, null);
    const changed: string[] = [];
    const dropped: string[] = [];
    const hooks = { companyChanged: (id: string) => void changed.push(id), clientDropped: (id: string) => void dropped.push(id) };
    await contactService.updateCompany(db, human, company.id, { notes: 'not synced' }, hooks);
    expect(changed).toEqual([]);
    await contactService.updateCompany(db, human, company.id, { name: 'Renamed' }, hooks);
    expect(changed).toEqual([company.id]);
    await contactService.deleteCompany(db, human, company.id, hooks);
    expect(dropped).toEqual(['ard-1']);
    expect((await db.company.findUniqueOrThrow({ where: { id: company.id } })).ardoiseClientId).toBeNull();
  });

  test('old delivery ids are pruned after 30 days', async () => {
    await db.ardoiseDelivery.create({ data: { id: 'old', event: 'client.created', receivedAt: new Date('2026-01-01') } });
    await db.ardoiseDelivery.create({ data: { id: 'fresh', event: 'client.created' } });
    expect(await ardoise.pruneDeliveries(db)).toBe(1);
    expect((await db.ardoiseDelivery.findMany()).map((d) => d.id)).toEqual(['fresh']);
  });
});
