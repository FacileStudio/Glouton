import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';

const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch');
const { appRouter, BulleUnavailableError, discovery, prospectProfile, prospectSuggest, taxonomy } = await import('@repo/trpc');

const silent = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {}, child: () => silent };

type User = { id: string; email: string; role: string };
type Body = { result?: { data?: Record<string, unknown> }; error?: { data?: { code?: string; plan_limit?: { key?: string; upgrade_url?: string } } } };

function reader(teams: string[], aiAccess: boolean) {
  const verdict = { allowed: true, enforced: true, aiAccess, upgradeUrl: 'https://sso.test/spaces' };
  return {
    team: async (_userId: string, teamId: string) => (teams.includes(teamId) ? verdict : null),
    personal: async () => verdict,
    entitledScopes: async () => ({ personal: true, teamIds: teams }),
  };
}

type FakeBulle = { calls: number; offer: () => Promise<unknown>; complete: () => Promise<string> };

function fakeBulle(answer: () => string): FakeBulle {
  const bulle: FakeBulle = {
    calls: 0,
    offer: async () => ({ backend: 'anthropic', model: 'm', models: ['m'], persona: '' }),
    complete: async () => {
      bulle.calls++;
      return answer();
    },
  };
  return bulle;
}

async function call(prisma: PrismaClient, path: string, user: User, gate: ReturnType<typeof reader>, input: unknown, mutation: boolean, bulle: FakeBulle | null = null) {
  const req = mutation
    ? new Request(`http://g.test/trpc/${path}`, { method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' } })
    : new Request(`http://g.test/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`);
  const res = await fetchRequestHandler({
    endpoint: '/trpc',
    req,
    router: appRouter,
    createContext: () =>
      ({ user, actor: null, scopes: null, log: silent, forfait: gate, prisma, jobs: null, bulle, env: { OIDC_ISSUER: 'https://sso.test' } }) as never,
  });
  const body = (await res.json()) as Body;
  return { status: res.status, data: body.result?.data, error: body.error };
}

describe('taxonomy', () => {
  test('search finds NAF codes by code, French and English label, ignoring accents', () => {
    expect(taxonomy.searchTaxonomy('62.01', 'fr')[0]).toEqual({ kind: 'naf', value: '62.01Z', label: 'Programmation informatique' });
    expect(taxonomy.searchTaxonomy('6201', 'en')[0]?.value).toBe('62.01Z');
    expect(taxonomy.searchTaxonomy('agences de publicite', 'fr').map((item) => item.value)).toContain('73.11Z');
    expect(taxonomy.searchTaxonomy('advertising agencies', 'fr').map((item) => item.value)).toContain('73.11Z');
    expect(taxonomy.searchTaxonomy('plomb', 'fr').some((item) => item.kind === 'osm' && item.value === 'craft=plumber')).toBe(true);
    expect(taxonomy.searchTaxonomy('plumber', 'de').find((item) => item.value === 'craft=plumber')?.label).toBe('Plumber');
    expect(taxonomy.searchTaxonomy('', 'fr')).toEqual([]);
    expect(taxonomy.searchTaxonomy('a', 'fr', { kinds: ['osm'], limit: 5 })).toHaveLength(5);
  });

  test('the vendored lists are complete enough and carry their sources', () => {
    expect(taxonomy.searchTaxonomy('', 'fr')).toEqual([]);
    expect(taxonomy.normalizeNaf('6201z')).toBe('62.01Z');
    expect(taxonomy.normalizeNaf('99.99Z')).toBeNull();
    expect(taxonomy.taxonomyLabel('01.11Z', 'en')).toContain('cereals');
    expect(taxonomy.TAXONOMY_SOURCES.naf.fr).toContain('insee.fr');
    expect(taxonomy.TAXONOMY_SOURCES.osm).toContain('id-tagging-schema');
  });

  test('every old category maps to known tags, and hunts accept both', () => {
    for (const category of taxonomy.LEGACY_CATEGORIES) {
      for (const tag of taxonomy.LEGACY_CATEGORY_TAGS[category]) expect({ category, tag, known: taxonomy.isOsmTag(tag) }).toEqual({ category, tag, known: true });
    }
    expect(taxonomy.tagsForCategory('bar')).toEqual(['amenity=bar', 'amenity=pub', 'amenity=nightclub']);
    expect(taxonomy.tagsForCategory('craft=plumber')).toEqual(['craft=plumber']);
    expect(taxonomy.tagsForCategory('other')).toEqual([]);
    expect(taxonomy.isHuntCategory('cafe')).toBe(true);
    expect(taxonomy.isHuntCategory('craft=plumber')).toBe(true);
    expect(taxonomy.isHuntCategory('craft=nope')).toBe(false);
  });
});

describe('profile model', () => {
  const row = (fields: Record<string, unknown>) =>
    ({
      id: 'p',
      scopeKey: 'user:u',
      userId: 'u',
      teamId: null,
      offerDescription: null,
      area: 'Lyon',
      targetCategories: [],
      nafCodes: [],
      keywords: [],
      website: null,
      ownCategory: null,
      usages: [],
      remote: false,
      targets: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      ...fields,
    }) as never;

  test('an old profile reads as clients plus competitors with its categories mapped to tags', () => {
    const profile = prospectProfile.present(
      row({ targetCategories: ['cafe', 'bar', 'nope'], ownCategory: 'web-dev-agency', nafCodes: ['62.01Z'], keywords: ['site web'] })
    );
    expect(profile.usages).toEqual(['clients', 'competitors']);
    expect(profile.onboarded).toBe(true);
    expect(profile.targets.clients).toEqual({
      description: null,
      osmTags: ['amenity=cafe', 'amenity=bar', 'amenity=pub', 'amenity=nightclub'],
      nafCodes: ['62.01Z'],
      keywords: ['site web'],
    });
    expect(profile.targets.competitors).toEqual({ description: null, osmTags: ['office=it'], nafCodes: ['62.01Z'], keywords: ['site web'] });
    expect(profile.targets.missions).toEqual({ description: null, osmTags: [], nafCodes: [], keywords: [] });
  });

  test('stored targets win over the old columns, per usage; no row means not onboarded', () => {
    const profile = prospectProfile.present(
      row({ targetCategories: ['cafe'], usages: ['competitors'], targets: { competitors: { description: 'Studios web', nafCodes: ['73.11Z'], osmTags: [], keywords: [] } } })
    );
    expect(profile.usages).toEqual(['competitors']);
    expect(profile.targets.competitors.nafCodes).toEqual(['73.11Z']);
    expect(profile.targets.clients.osmTags).toEqual(['amenity=cafe']);
    expect(prospectProfile.present(null)).toMatchObject({ usages: [], onboarded: false });
  });

  test('validation refuses unknown map tags, bad NAF codes, unknown usages and an empty usage list', () => {
    const schema = prospectProfile.profileFieldsSchema;
    expect(schema.safeParse({ usages: ['clients', 'job'], targets: { clients: { osmTags: ['craft=plumber'], nafCodes: ['43.22a'] } } }).success).toBe(true);
    expect(schema.safeParse({ targets: { clients: { osmTags: ['craft=nope'] } } }).success).toBe(false);
    expect(schema.safeParse({ targets: { clients: { nafCodes: ['62-01'] } } }).success).toBe(false);
    expect(schema.safeParse({ usages: ['dating'] }).success).toBe(false);
    expect(schema.safeParse({ usages: [] }).success).toBe(false);
    expect(schema.safeParse({ website: 'not a site' }).success).toBe(false);
  });

  test('the competitor description drives the first web search', () => {
    const base = { offerDescription: null, area: 'France', website: 'facile.studio', description: 'studios web et agences digitales en France', nafCodes: [], osmTags: [], keywords: [] };
    expect(discovery.discoveryQueries(base)[0]).toEqual({ query: 'studios web et agences digitales en France', source: 'SONAR_WEB' });
    expect(discovery.searchable({ ...base, website: null })).toBe(true);
  });
});

const user: User = { id: '00000000-0000-4000-8000-0000000000a1', email: 'a@test', role: 'USER' };
const input = { usage: 'competitors', language: 'fr', offer: 'web apps, design', description: 'studios web' };
const noDb = { forfaitState: { findUnique: async () => null } } as unknown as PrismaClient;

describe('AI suggestions', () => {
  test('the answer is validated: unknown codes and tags drop, codes normalize, lists cap', () => {
    const raw = '```json\n{"nafCodes": ["6201z", "73.11Z", "99.99Z", 4], "osmTags": ["office=it", "office=nope", "Office=Advertising_Agency"], "keywords": [" Studio Web ", "studio web", ""]}\n```';
    expect(prospectSuggest.parseTargetSuggestion(raw)).toEqual({
      nafCodes: ['62.01Z', '73.11Z'],
      osmTags: ['office=it', 'office=advertising_agency'],
      keywords: ['studio web'],
    });
    expect(() => prospectSuggest.parseTargetSuggestion('no json here')).toThrow();
    expect(() => prospectSuggest.parseTargetSuggestion('{"nafCodes": "62.01Z"}')).toThrow();
  });


  test('without ai.access the call is refused with the upsell before Bulle is asked', async () => {
    const bulle = fakeBulle(() => '{}');
    const res = await call(noDb, 'prospect.suggestTargets', user, reader([], false), input, true, bulle);
    expect(res.status).toBe(403);
    expect(res.error?.data?.plan_limit).toMatchObject({ key: 'ai.access', upgrade_url: 'https://sso.test/spaces' });
    expect(bulle.calls).toBe(0);
  });

  test("Bulle's own 402 shows the same upsell, an unreadable answer is 422, a good one comes back as chips", async () => {
    const refusing = fakeBulle(() => {
      throw new BulleUnavailableError('plan_required', 'plan', { key: 'ai.access', upgrade_url: 'https://sso.test/up' });
    });
    const refused = await call(noDb, 'prospect.suggestTargets', user, reader([], true), input, true, refusing);
    expect(refused.status).toBe(403);
    expect(refused.error?.data?.plan_limit).toMatchObject({ key: 'ai.access' });
    const broken = await call(noDb, 'prospect.suggestTargets', user, reader([], true), input, true, fakeBulle(() => 'sorry'));
    expect(broken.status).toBe(422);
    const ok = await call(noDb, 'prospect.suggestTargets', user, reader([], true), input, true, fakeBulle(() => '{"nafCodes":["62.01Z"],"osmTags":["office=it"],"keywords":["studio web"]}'));
    expect(ok.status).toBe(200);
    expect(ok.data).toEqual({ nafCodes: ['62.01Z'], osmTags: ['office=it'], keywords: ['studio web'] });
  });
});

describe.skipIf(!databaseUrl)('profile scoping', () => {
  let prisma: PrismaClient;
  const tag = crypto.randomUUID().slice(0, 8);
  const ids = { teamA: '', teamB: '' };
  let alice: User;
  let bob: User;

  beforeAll(async () => {
    prisma = (await import('@repo/database')).prisma as PrismaClient;
    const a = await prisma.user.create({ data: { email: `pa-${tag}@x.test`, firstName: 'A', lastName: 'A', password: 'x' } });
    const b = await prisma.user.create({ data: { email: `pb-${tag}@x.test`, firstName: 'B', lastName: 'B', password: 'x' } });
    alice = { id: a.id, email: a.email, role: 'USER' };
    bob = { id: b.id, email: b.email, role: 'USER' };
    ids.teamA = (await prisma.team.create({ data: { name: `pa-${tag}` } })).id;
    ids.teamB = (await prisma.team.create({ data: { name: `pb-${tag}` } })).id;
    await prisma.teamMember.createMany({
      data: [
        { teamId: ids.teamA, userId: a.id, role: 'OWNER' },
        { teamId: ids.teamB, userId: b.id, role: 'OWNER' },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.team.deleteMany({ where: { id: { in: [ids.teamA, ids.teamB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
  }, 60_000);

  test('the wizard save onboards the space; another team can neither read nor write it', async () => {
    const saved = await call(prisma, 'prospect.save', alice, reader([ids.teamA], false), {
      teamId: ids.teamA,
      usages: ['competitors'],
      offerDescription: 'web apps, design, open source Google Workspace alternative',
      website: 'https://www.facile.studio/',
      area: 'France',
      targets: { competitors: { description: 'studios web et agences digitales en France', nafCodes: ['62.01Z', '73.11Z'] } },
    }, true);
    expect(saved.status).toBe(200);
    expect(saved.data).toMatchObject({ onboarded: true, usages: ['competitors'], website: 'facile.studio', targets: { competitors: { nafCodes: ['62.01Z', '73.11Z'], osmTags: [] } } });
    for (const [path, body, mutation] of [
      ['prospect.get', { teamId: ids.teamA }, false],
      ['prospect.save', { teamId: ids.teamA, area: 'Hacked' }, true],
      ['prospect.suggestTargets', { ...input, teamId: ids.teamA }, true],
    ] as const) {
      const res = await call(prisma, path, bob, reader([ids.teamB], true), body, mutation, fakeBulle(() => '{}'));
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
    }
    const row = await prisma.teamProspectProfile.findUniqueOrThrow({ where: { scopeKey: `team:${ids.teamA}` } });
    expect(row.area).toBe('France');
  });
});
