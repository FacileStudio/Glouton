import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';

const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch');
const { appRouter, discovery, profileFor, prospectProfile } = await import('@repo/trpc');
const { WebSearchError } = await import('@repo/websearch');
const { osmUrl } = await import('@repo/jobs/workers');
const { dispatchWebhookEvent, webhookTransport } = await import('@repo/webhooks');

const silent = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {}, child: () => silent };

type User = { id: string; email: string; role: string };
type Row = { id: string; evidence: Array<Record<string, unknown>> };
type Data = {
  items: Row[];
  profileReady: boolean;
  competitorId: string;
  id: string;
  events: string[];
  enabled: boolean;
  map: Row[]['map'];
};
type Body = { result?: { data?: Data }; error?: { data?: { code?: string } } };

/** A gate reader that treats the listed teams as the caller's, with every plan allowed. */
function reader(teams: string[]) {
  const verdict = { allowed: true, enforced: true, upgradeUrl: 'https://sso.test/spaces' };
  return {
    team: async (_userId: string, teamId: string) => (teams.includes(teamId) ? verdict : null),
    personal: async () => verdict,
    entitledScopes: async () => ({ personal: true, teamIds: teams }),
  };
}

function fakeJobs() {
  const added: Array<{ queue: string; data: Record<string, unknown>; opts?: { delay?: number } }> = [];
  return {
    added,
    addJob: async (queue: string, _name: string, data: Record<string, unknown>, opts?: { delay?: number }) => {
      added.push({ queue, data, opts });
      return {} as never;
    },
  };
}

async function call(prisma: PrismaClient, path: string, user: User, gate: ReturnType<typeof reader>, input: unknown, mutation = false, jobs = fakeJobs()) {
  const req = mutation
    ? new Request(`http://g.test/trpc/${path}`, { method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' } })
    : new Request(`http://g.test/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`);
  const res = await fetchRequestHandler({
    endpoint: '/trpc',
    req,
    router: appRouter,
    createContext: () =>
      ({ user, actor: null, scopes: null, log: silent, forfait: gate, prisma, jobs, bulle: null, env: { OIDC_ISSUER: 'https://sso.test' } }) as never,
  });
  const body = (await res.json()) as Body;
  return { status: res.status, data: body.result?.data as Data, error: body.error };
}

const emptyProfile = {
  offerDescription: null as string | null,
  area: 'Lyon, FR' as string | null,
  description: null as string | null,
  nafCodes: [] as string[],
  osmTags: [] as string[],
  keywords: [] as string[],
  website: null as string | null,
};

const result = (url: string, title = 'Agence', snippet = 'Création de site web à Lyon') => ({ url, title, snippet, engine: 'test' });

describe('discovery rules', () => {
  test('the score adds visible parts: sources, keyword share, then distance or area', () => {
    const base = { sources: ['SONAR_WEB' as const], keywords: [], keywordTotal: 4, distanceKm: null, inArea: false, nafMatch: false };
    expect(discovery.scoreOf(base)).toBe(15);
    expect(discovery.scoreOf({ ...base, keywords: ['site', 'web'] })).toBe(15 + 18);
    expect(discovery.scoreOf({ ...base, sources: ['SONAR_WEB', 'OSM', 'BODACC', 'SONAR_SIMILAR'] })).toBe(45);
    expect(discovery.scoreOf({ ...base, distanceKm: 3 })).toBe(35);
    expect(discovery.scoreOf({ ...base, distanceKm: 12 })).toBe(27);
    expect(discovery.scoreOf({ ...base, distanceKm: 80, inArea: true })).toBe(30);
    expect(discovery.scoreOf({ ...base, sources: ['BODACC'], nafMatch: true, inArea: true })).toBe(15 + 35 + 15);
    expect(discovery.scoreOf({ ...base, keywordTotal: 0 })).toBe(15);
  });

  test('NAF codes match as prefixes and the area matches city, district, postcode, department or region', () => {
    expect(discovery.matchesNaf(['62.01'], '62.01Z')).toBe(true);
    expect(discovery.matchesNaf(['62'], '62.02A')).toBe(true);
    expect(discovery.matchesNaf(['62.01Z'], '62.02A')).toBe(false);
    expect(discovery.matchesNaf(['62'], null)).toBe(false);
    expect(discovery.inArea('Lyon, FR', { city: 'LYON', postalCode: '69003' })).toBe(true);
    expect(discovery.inArea('Lyon 3e', { city: 'Lyon', postalCode: '69003' })).toBe(true);
    expect(discovery.inArea('Saint-Étienne', { city: 'Saint Etienne' })).toBe(true);
    expect(discovery.inArea('69', { city: 'Villeurbanne', postalCode: '69100' })).toBe(true);
    expect(discovery.inArea('69003', { city: 'Lyon', postalCode: '69001' })).toBe(false);
    expect(discovery.inArea('Bretagne', { city: 'Rennes', region: 'Bretagne' })).toBe(true);
    expect(discovery.inArea('Lyon', { city: 'Paris', postalCode: '75011' })).toBe(false);
    expect(discovery.inArea('France', { city: 'Paris' })).toBe(false);
    expect(discovery.inArea(null, { city: 'Paris' })).toBe(false);
  });

  test('directories, our own site and non-sites never become candidates', () => {
    expect(discovery.candidateDomain('https://www.pagesjaunes.fr/pros/123')).toBeNull();
    expect(discovery.candidateDomain('https://fr.linkedin.com/company/x')).toBeNull();
    expect(discovery.candidateDomain('https://blog.monsite.fr/a', 'monsite.fr')).toBeNull();
    expect(discovery.candidateDomain('localhost')).toBeNull();
    expect(discovery.candidateDomain('https://www.Rival.fr/tarifs')).toBe('rival.fr');
  });

  test('queries use keywords, the offer and similar-site searches, capped', () => {
    const queries = discovery.discoveryQueries({
      ...emptyProfile,
      keywords: ['site web', 'seo', 'wordpress', 'shopify'],
      offerDescription: 'Nous créons des sites vitrines rapides pour les artisans et les commerces',
      website: 'monsite.fr',
    });
    expect(queries.map((q) => q.query)).toEqual([
      'site web Lyon',
      'seo Lyon',
      'wordpress Lyon',
      'Nous créons des sites vitrines rapides pour les Lyon',
      'alternatives à monsite.fr',
      'concurrents de monsite.fr',
    ]);
    expect(queries.filter((q) => q.source === 'SONAR_SIMILAR')).toHaveLength(2);
    expect(discovery.discoveryQueries({ ...emptyProfile, area: null, keywords: ['seo'] })).toEqual([{ query: 'seo', source: 'SONAR_WEB' }]);
  });

  test('candidates sharing a domain or a SIREN merge into one company', () => {
    const base = { website: null, area: null, distanceKm: null, inArea: false, siren: null };
    const merged = discovery.mergeCandidates([
      { ...base, name: 'Rival', domain: 'rival.fr', source: 'SONAR_WEB', evidence: { source: 'SONAR_WEB', snippet: 'a', url: 'https://rival.fr' } },
      { ...base, name: 'Rival again', domain: 'rival.fr', source: 'SONAR_WEB', evidence: { source: 'SONAR_WEB', snippet: 'a', url: 'https://rival.fr' } },
      { ...base, name: 'Rival SAS', domain: 'rival.fr', siren: '123456789', source: 'BODACC', distanceKm: null, evidence: { source: 'BODACC', snippet: 'b', url: null } },
      { ...base, name: 'Rival bis', domain: null, siren: '123456789', source: 'BODACC', evidence: { source: 'BODACC', snippet: 'c', url: null } },
      { ...base, name: 'Nowhere', domain: null, source: 'OSM', evidence: { source: 'OSM', snippet: 'd', url: null } },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ name: 'Rival', domain: 'rival.fr', siren: '123456789', sources: ['SONAR_WEB', 'BODACC'] });
    expect(merged[0]!.evidence).toHaveLength(3);
  });

  test('a map place id becomes its OpenStreetMap page', () => {
    expect(osmUrl('osm_node_42')).toBe('https://www.openstreetmap.org/node/42');
    expect(osmUrl('nope')).toBeNull();
  });

  test('the first quota refusal stops the remaining web searches cleanly', async () => {
    const asked: string[] = [];
    const web = {
      search: async (key: string, query: string) => {
        asked.push(`${key}|${query}`);
        if (asked.length === 2) throw new WebSearchError('quota_exceeded', 'daily searches quota of 50 reached');
        return [result('https://rival.fr'), result('https://www.pagesjaunes.fr/x')];
      },
    };
    const out = await discovery.webCandidates(web, { type: 'team', teamId: 'team-1', userId: 'u' }, { ...emptyProfile, keywords: ['seo', 'web', 'wordpress'] });
    expect(asked).toEqual(['team-1|seo Lyon', 'team-1|web Lyon']);
    expect(out.quotaExhausted).toBe(true);
    expect(out.queries).toBe(1);
    expect(out.candidates.map((c) => c.domain)).toEqual(['rival.fr']);
    expect(out.candidates[0]!.inArea).toBe(true);
  });

  test('another web failure skips that search only', async () => {
    let calls = 0;
    const web = {
      search: async () => {
        calls++;
        if (calls === 1) throw new WebSearchError('timeout', 'slow');
        return [result('https://other.fr')];
      },
    };
    const out = await discovery.webCandidates(web, { type: 'personal', userId: 'u1' }, { ...emptyProfile, keywords: ['a', 'b'] });
    expect(calls).toBe(2);
    expect(out).toMatchObject({ quotaExhausted: false, queries: 1, errors: ['web:timeout'] });
  });
});

describe.skipIf(!databaseUrl)('discovery on the database', () => {
  let prisma: PrismaClient;
  const tag = crypto.randomUUID().slice(0, 8);
  const users: Record<string, User> = {};
  const city = `Ville${tag}`;
  const suburb = `Bourg${tag}`;
  const ids: Record<string, string> = {};
  const team = () => ({ type: 'team' as const, teamId: ids.teamA!, userId: users.alice!.id });
  const sirens = [`9${Date.now().toString().slice(-8)}`, `8${Date.now().toString().slice(-8)}`, `7${Date.now().toString().slice(-8)}`, `6${Date.now().toString().slice(-8)}`];
  const companyIds: string[] = [];

  async function company(siren: string, data: { name: string; activityCode: string; city: string; postalCode: string; domain?: string }) {
    const row = await prisma.companyCreation.create({
      data: {
        country: 'FR',
        registrationId: siren,
        name: data.name,
        activityCode: data.activityCode,
        activityLabel: 'Programmation informatique',
        city: data.city,
        postalCode: data.postalCode,
        publishedAt: new Date(),
        sourceUrl: `https://www.bodacc.fr/annonce/${siren}`,
        domain: data.domain ?? null,
        hasWebsite: Boolean(data.domain),
      },
    });
    companyIds.push(row.id);
    return row;
  }

  beforeAll(async () => {
    prisma = (await import('@repo/database')).prisma;
    for (const name of ['alice', 'carol', 'bob']) {
      const row = await prisma.user.create({ data: { email: `d-${name}-${tag}@x.test`, firstName: name, lastName: 'T', password: 'x' } });
      users[name] = { id: row.id, email: row.email, role: 'USER' };
    }
    ids.teamA = (await prisma.team.create({ data: { name: `da-${tag}` } })).id;
    ids.teamB = (await prisma.team.create({ data: { name: `db-${tag}` } })).id;
    await prisma.teamMember.createMany({
      data: [
        { teamId: ids.teamA, userId: users.alice!.id, role: 'OWNER' },
        { teamId: ids.teamA, userId: users.carol!.id, role: 'MEMBER' },
        { teamId: ids.teamB, userId: users.bob!.id, role: 'OWNER' },
      ],
    });
    await prisma.teamProspectProfile.create({
      data: {
        scopeKey: `team:${ids.teamA}`,
        userId: users.alice!.id,
        teamId: ids.teamA,
        area: `${city}, FR`,
        nafCodes: ['62.01'],
        keywords: ['site web', 'seo'],
        website: 'monsite.fr',
      },
    });
    await prisma.competitor.create({ data: { userId: users.alice!.id, teamId: ids.teamA, name: 'Known', domain: 'known.fr', website: 'https://known.fr' } });
  }, 60_000);

  afterAll(async () => {
    await prisma.companyCreation.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.team.deleteMany({ where: { id: { in: [ids.teamA!, ids.teamB!] } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } });
  }, 60_000);

  test('BODACC rows are kept only when both the NAF code and the area match', async () => {
    await company(sirens[0]!, { name: 'Code Lyonnais', activityCode: '62.01Z', city, postalCode: '69002' });
    await company(sirens[1]!, { name: 'Boulangerie', activityCode: '10.71C', city, postalCode: '69002' });
    await company(sirens[2]!, { name: 'Code Parisien', activityCode: '62.01Z', city: 'Paris', postalCode: '75011' });
    const profile = prospectProfile.searchProfile(await profileFor(prisma, team()), 'competitors');
    const found = await discovery.bodaccCandidates(prisma, profile, { now: new Date() });
    const mine = found.filter((c) => sirens.includes(c.siren ?? ''));
    expect(mine.map((c) => c.name)).toEqual(['Code Lyonnais']);
    expect(mine[0]).toMatchObject({ source: 'BODACC', siren: sirens[0], area: city, inArea: true });
  });

  test('a run merges sources, skips known competitors, scores, and keeps going when the quota runs out', async () => {
    let searches = 0;
    const web = {
      search: async (key: string) => {
        expect(key).toBe(ids.teamA);
        searches++;
        if (searches > 2) throw new WebSearchError('quota_exceeded', 'quota');
        return [result('https://rival.fr', 'Rival - agence site web', `Agence SEO et site web à ${city}`), result('https://known.fr'), result('https://monsite.fr')];
      },
    };
    const notices: string[] = [];
    const out = await discovery.runDiscovery({ prisma, web, places: null, notify: async (_s, type) => void notices.push(type) }, team());
    expect(out).toMatchObject({ status: 'done', quotaExhausted: true, queries: 2 });
    expect(out.known).toBe(1);
    expect(notices).toEqual([discovery.DONE_EVENT]);
    const rows = await prisma.competitorSuggestion.findMany({ where: { teamId: ids.teamA }, orderBy: { score: 'desc' } });
    const rival = rows.find((row) => row.domain === 'rival.fr')!;
    expect(rival).toMatchObject({ status: 'PENDING', sources: ['SONAR_WEB'], name: 'Rival' });
    expect(rival.score).toBe(15 + 35 + 15);
    expect(rows.find((row) => row.siren === sirens[0])).toMatchObject({ name: 'Code Lyonnais', sources: ['BODACC'] });
    expect(rows.some((row) => row.domain === 'known.fr' || row.domain === 'monsite.fr')).toBe(false);
    const state = await prisma.competitorDiscoveryState.findUniqueOrThrow({ where: { scopeKey: `team:${ids.teamA}` } });
    expect(state.status).toBe('done');
    expect(state.nextRunAt!.getTime() - state.lastRunAt!.getTime()).toBe(discovery.WEEK_MS);
    ids.rival = rival.id;
    ids.bodacc = rows.find((row) => row.siren === sirens[0])!.id;
  });

  test('a rejected company never comes back, and a pending one gains the new source', async () => {
    const rejected = await call(prisma, 'competitorDiscovery.reject', users.carol!, reader([ids.teamA!]), { teamId: ids.teamA, suggestionId: ids.bodacc }, true);
    expect(rejected.status).toBe(200);
    const places = async () => [
      { name: 'Rival', website: 'https://www.rival.fr', city, address: '1 rue', category: 'office', url: 'https://www.openstreetmap.org/node/1', distanceKm: 2.5 },
    ];
    const out = await discovery.runDiscovery({ prisma, web: null, places: null }, team());
    expect(out.decided).toBe(1);
    expect(out.created).toBe(0);
    await prisma.teamProspectProfile.update({ where: { scopeKey: `team:${ids.teamA}` }, data: { ownCategory: 'professional-services' } });
    const again = await discovery.runDiscovery({ prisma, web: null, places }, team());
    expect(again).toMatchObject({ created: 0, updated: 1, decided: 1 });
    const rival = await prisma.competitorSuggestion.findUniqueOrThrow({ where: { id: ids.rival } });
    expect(rival.sources).toEqual(['SONAR_WEB', 'OSM']);
    expect(rival.distanceKm).toBe(2.5);
    expect(rival.score).toBe(30 + 35 + 20);
    expect(await prisma.competitorSuggestion.findUniqueOrThrow({ where: { id: ids.bodacc } })).toMatchObject({ status: 'REJECTED' });
  });

  test('another team cannot read or decide the suggestions', async () => {
    const bob = users.bob!;
    const refused: Array<[string, unknown, boolean]> = [
      ['competitorDiscovery.list', { teamId: ids.teamA }, false],
      ['competitorDiscovery.counts', { teamId: ids.teamA }, false],
      ['competitorDiscovery.run', { teamId: ids.teamA }, true],
      ['competitorDiscovery.accept', { teamId: ids.teamA, suggestionId: ids.rival }, true],
      ['competitorDiscovery.reject', { teamId: ids.teamA, suggestionId: ids.rival }, true],
      ['competitorDiscovery.acceptAbove', { teamId: ids.teamA, minScore: 1 }, true],
    ];
    for (const [path, input, mutation] of refused) {
      const res = await call(prisma, path, bob, reader([ids.teamB!]), input, mutation);
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
    }
    for (const path of ['competitorDiscovery.accept', 'competitorDiscovery.reject']) {
      const own = await call(prisma, path, bob, reader([ids.teamB!]), { teamId: ids.teamB, suggestionId: ids.rival }, true);
      expect({ path, status: own.status }).toEqual({ path, status: 404 });
      const personal = await call(prisma, path, bob, reader([]), { suggestionId: ids.rival }, true);
      expect({ path, status: personal.status }).toEqual({ path, status: 404 });
    }
    const list = await call(prisma, 'competitorDiscovery.list', bob, reader([ids.teamB!]), { teamId: ids.teamB });
    expect(list.data.items).toEqual([]);
    expect(await prisma.competitorSuggestion.findUniqueOrThrow({ where: { id: ids.rival } })).toMatchObject({ status: 'PENDING' });
  });

  test('a member lists the queue, clears the badge, and accepts into a prefilled competitor', async () => {
    const carol = users.carol!;
    const gate = reader([ids.teamA!]);
    const counts = await call(prisma, 'competitorDiscovery.counts', carol, gate, { teamId: ids.teamA });
    expect(counts.data as unknown).toEqual({ pending: 1, fresh: 1 });
    expect((await call(prisma, 'competitorDiscovery.markSeen', carol, gate, { teamId: ids.teamA }, true)).status).toBe(200);
    expect((await call(prisma, 'competitorDiscovery.counts', carol, gate, { teamId: ids.teamA })).data as unknown).toEqual({ pending: 1, fresh: 0 });
    const list = await call(prisma, 'competitorDiscovery.list', carol, gate, { teamId: ids.teamA });
    expect(list.data.profileReady).toBe(true);
    expect(list.data.items[0]!.evidence[0]).toMatchObject({ source: 'SONAR_WEB', url: 'https://rival.fr' });
    const accepted = await call(prisma, 'competitorDiscovery.accept', carol, gate, { teamId: ids.teamA, suggestionId: ids.rival }, true);
    expect(accepted.status).toBe(200);
    const competitor = await prisma.competitor.findUniqueOrThrow({ where: { id: accepted.data.competitorId } });
    expect(competitor).toMatchObject({ teamId: ids.teamA, name: 'Rival', domain: 'rival.fr', website: 'https://rival.fr' });
    expect(competitor.notes).toContain('Agence SEO');
    const twice = await call(prisma, 'competitorDiscovery.accept', carol, gate, { teamId: ids.teamA, suggestionId: ids.rival }, true);
    expect(twice.status).toBe(409);
    const rejected = await call(prisma, 'competitorDiscovery.list', carol, gate, { teamId: ids.teamA, status: 'REJECTED' });
    expect(rejected.data.items.map((row: { id: string }) => row.id)).toEqual([ids.bodacc]);
  });

  test('accept all above a score takes only the suggestions at or above it', async () => {
    const scope = team();
    const base = { scopeKey: `team:${ids.teamA}`, userId: scope.userId, teamId: ids.teamA, source: 'SONAR_WEB' as const, sources: ['SONAR_WEB' as const] };
    await prisma.competitorSuggestion.createMany({
      data: [
        { ...base, name: 'High', domain: `high-${tag}.fr`, website: `https://high-${tag}.fr`, score: 80 },
        { ...base, name: 'Low', domain: `low-${tag}.fr`, score: 20 },
      ],
    });
    const res = await call(prisma, 'competitorDiscovery.acceptAbove', users.alice!, reader([ids.teamA!]), { teamId: ids.teamA, minScore: 60 }, true);
    expect(res.data as unknown).toEqual({ accepted: 1 });
    expect(await prisma.competitor.count({ where: { teamId: ids.teamA, domain: `high-${tag}.fr` } })).toBe(1);
    expect(await prisma.competitorSuggestion.findFirstOrThrow({ where: { domain: `low-${tag}.fr` } })).toMatchObject({ status: 'PENDING' });
  });

  test('run now queues one job, refuses an empty profile, and the weekly scan claims each slot once', async () => {
    const jobs = fakeJobs();
    const first = await call(prisma, 'competitorDiscovery.run', users.alice!, reader([ids.teamA!]), { teamId: ids.teamA }, true, jobs);
    expect(first.data as unknown).toEqual({ queued: true });
    const second = await call(prisma, 'competitorDiscovery.run', users.alice!, reader([ids.teamA!]), { teamId: ids.teamA }, true, jobs);
    expect(second.data as unknown).toEqual({ queued: false });
    expect(jobs.added).toEqual([{ queue: discovery.DISCOVERY_QUEUE, data: { userId: users.alice!.id, teamId: ids.teamA, trigger: 'manual' }, opts: expect.anything() }]);
    const empty = await call(prisma, 'competitorDiscovery.run', users.bob!, reader([ids.teamB!]), { teamId: ids.teamB }, true);
    expect(empty.status).toBe(412);

    await prisma.competitorDiscoveryState.update({ where: { scopeKey: `team:${ids.teamA}` }, data: { status: 'done', nextRunAt: new Date(Date.now() - 1000) } });
    const scan = fakeJobs();
    const [one, two] = await Promise.all([
      discovery.tick({ prisma, jobs: scan as never, allowed: async () => true }),
      discovery.tick({ prisma, jobs: scan as never, allowed: async () => true }),
    ]);
    const mine = scan.added.filter((job) => job.data.teamId === ids.teamA);
    expect(mine).toHaveLength(1);
    expect(one.queued + two.queued).toBeGreaterThanOrEqual(1);
    const later = fakeJobs();
    await discovery.tick({ prisma, jobs: later as never, allowed: async () => true });
    expect(later.added.filter((job) => job.data.teamId === ids.teamA)).toHaveLength(0);
  });

  test('the BODACC watch baselines first, then turns new matching companies into suggestions with an alert', async () => {
    await prisma.competitorDiscoveryState.update({ where: { scopeKey: `team:${ids.teamA}` }, data: { bodaccCursor: null } });
    const hooks: Array<{ event: string; teamId: string; data: Record<string, unknown> }> = [];
    const notices: Array<{ type: string; data: Record<string, unknown> }> = [];
    const deps = {
      prisma,
      web: null,
      places: null,
      allowed: async (scope: { teamId: string | null }) => scope.teamId === ids.teamA,
      notify: async (_scope: unknown, type: string, data: Record<string, unknown>) => void notices.push({ type, data }),
      dispatch: async (options: { event: string; teamId: string; data: Record<string, unknown> }) => void hooks.push(options),
    };
    const baseline = await discovery.watchRegistrations(deps);
    expect(baseline.baselined).toBeGreaterThanOrEqual(1);
    expect(hooks).toEqual([]);
    await company(sirens[3]!, { name: 'Nouveau Dev', activityCode: '62.01Z', city: suburb, postalCode: '69100' });
    await prisma.teamProspectProfile.update({ where: { scopeKey: `team:${ids.teamA}` }, data: { area: `${city}, ${suburb}` } });
    const watched = await discovery.watchRegistrations(deps);
    expect(watched.created).toBe(1);
    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toMatchObject({ event: 'competitor.new_registered', teamId: ids.teamA, data: { count: 1 } });
    expect((hooks[0]!.data.items as Array<{ name: string }>)[0]!.name).toBe('Nouveau Dev');
    expect(notices.map((n) => n.type)).toEqual([discovery.REGISTERED_EVENT]);
    const quiet = await discovery.watchRegistrations(deps);
    expect(quiet.created).toBe(0);
    expect(hooks).toHaveLength(1);
  });
});

describe.skipIf(!databaseUrl)('team webhook settings', () => {
  let prisma: PrismaClient;
  const tag = crypto.randomUUID().slice(0, 8);
  const users: Record<string, User> = {};
  const ids: Record<string, string> = {};
  const original = { ...webhookTransport };
  const received: Array<{ url: string; address: string; event: string | undefined; body: { event?: string } }> = [];
  const dns: Record<string, string[]> = {
    'antenne.facile.studio': ['2a06:98c1:3120::1', '188.114.96.1'],
    'rebound.example.com': ['10.0.0.7'],
  };

  beforeAll(async () => {
    prisma = (await import('@repo/database')).prisma;
    webhookTransport.resolve = async (host) =>
      (dns[host] ?? []).map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
    webhookTransport.post = async (target, address, body, headers) => {
      received.push({ url: target.toString(), address: address.address, event: headers['X-Webhook-Event'], body: JSON.parse(body) });
      return 200;
    };
    for (const name of ['owner', 'admin', 'member', 'other']) {
      const row = await prisma.user.create({ data: { email: `w-${name}-${tag}@x.test`, firstName: name, lastName: 'T', password: 'x' } });
      users[name] = { id: row.id, email: row.email, role: 'USER' };
    }
    ids.team = (await prisma.team.create({ data: { name: `wa-${tag}` } })).id;
    ids.other = (await prisma.team.create({ data: { name: `wb-${tag}` } })).id;
    await prisma.teamMember.createMany({
      data: [
        { teamId: ids.team, userId: users.owner!.id, role: 'OWNER' },
        { teamId: ids.team, userId: users.admin!.id, role: 'ADMIN' },
        { teamId: ids.team, userId: users.member!.id, role: 'MEMBER' },
        { teamId: ids.other, userId: users.other!.id, role: 'OWNER' },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    Object.assign(webhookTransport, original);
    await prisma.team.deleteMany({ where: { id: { in: [ids.team!, ids.other!] } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } });
  }, 60_000);

  const hook = () => ({ teamId: ids.team, name: 'Antenne', url: 'https://antenne.facile.studio/webhook/glouton', events: ['competitor.new_registered', 'hunt.digest'] });

  test('only team admins list, add, test, change and delete webhooks', async () => {
    const gate = reader([ids.team!]);
    const member = users.member!;
    const denied: Array<[string, unknown, boolean]> = [
      ['team.listWebhooks', { teamId: ids.team }, false],
      ['team.createWebhook', hook(), true],
      ['team.testWebhook', { teamId: ids.team, url: hook().url }, true],
    ];
    for (const [path, input, mutation] of denied) {
      const res = await call(prisma, path, member, gate, input, mutation);
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
    }
    expect(received).toHaveLength(0);

    const created = await call(prisma, 'team.createWebhook', users.admin!, gate, hook(), true);
    expect(created.status).toBe(200);
    expect(created.data.events).toEqual(['competitor.new_registered', 'hunt.digest']);
    const webhookId = created.data.id;

    for (const [path, input] of [
      ['team.updateWebhook', { teamId: ids.team, webhookId, enabled: false }],
      ['team.deleteWebhook', { teamId: ids.team, webhookId }],
    ] as const) {
      expect({ path, status: (await call(prisma, path, member, gate, input, true)).status }).toEqual({ path, status: 403 });
      const foreign = await call(prisma, path, users.other!, reader([ids.other!]), { ...input, teamId: ids.other }, true);
      expect({ path, status: foreign.status }).toEqual({ path, status: 404 });
    }

    const listed = await call(prisma, 'team.listWebhooks', users.owner!, gate, { teamId: ids.team });
    expect(listed.data.map((row: { id: string }) => row.id)).toEqual([webhookId]);

    const tested = await call(prisma, 'team.testWebhook', users.admin!, gate, { teamId: ids.team, url: hook().url }, true);
    expect(tested.status).toBe(200);
    expect(received).toEqual([
      {
        url: 'https://antenne.facile.studio/webhook/glouton',
        address: '188.114.96.1',
        event: 'webhook.test',
        body: expect.objectContaining({ event: 'webhook.test' }),
      },
    ]);

    received.length = 0;
    await dispatchWebhookEvent({ event: 'hunt.digest', teamId: ids.team, data: { count: 3 } });
    expect(received.map((row) => [row.url, row.address, row.event])).toEqual([
      ['https://antenne.facile.studio/webhook/glouton', '188.114.96.1', 'hunt.digest'],
    ]);
    received.length = 0;

    const paused = await call(prisma, 'team.updateWebhook', users.admin!, gate, { teamId: ids.team, webhookId, enabled: false }, true);
    expect(paused.data.enabled).toBe(false);
    expect((await call(prisma, 'team.deleteWebhook', users.admin!, gate, { teamId: ids.team, webhookId }, true)).status).toBe(200);
    expect(await prisma.teamWebhook.count({ where: { teamId: ids.team } })).toBe(0);
  });

  test('a webhook must use http(s) and subscribe to known events', async () => {
    const gate = reader([ids.team!]);
    expect((await call(prisma, 'team.createWebhook', users.admin!, gate, { ...hook(), url: 'file:///etc/passwd' }, true)).status).toBe(400);
    expect((await call(prisma, 'team.createWebhook', users.admin!, gate, { ...hook(), events: ['nope'] }, true)).status).toBe(400);
    expect((await call(prisma, 'team.createWebhook', users.admin!, gate, { ...hook(), events: [] }, true)).status).toBe(400);
  });

  test('internal webhook addresses are refused at create, update and test send', async () => {
    const gate = reader([ids.team!]);
    const internal = [
      'http://127.0.0.1:3001/hook',
      'http://localhost/hook',
      'http://10.0.0.5/hook',
      'http://172.16.0.1/hook',
      'http://192.168.1.1/hook',
      'http://169.254.169.254/latest/meta-data',
      'http://100.64.0.1/hook',
      'http://[::1]/hook',
      'http://[fd00::1]/hook',
      'http://[fe80::1]/hook',
      'http://glouton-redis:6379/',
      'https://user:pw@antenne.facile.studio/webhook/glouton',
      'https://rebound.example.com/hook',
      'https://nowhere.example.com/hook',
    ];
    for (const url of internal) {
      const created = await call(prisma, 'team.createWebhook', users.admin!, gate, { ...hook(), url }, true);
      expect({ url, status: created.status }).toEqual({ url, status: 400 });
      const tested = await call(prisma, 'team.testWebhook', users.admin!, gate, { teamId: ids.team, url }, true);
      expect({ url, status: tested.status }).toEqual({ url, status: 400 });
    }
    expect(received).toHaveLength(0);

    const created = await call(prisma, 'team.createWebhook', users.admin!, gate, hook(), true);
    expect(created.status).toBe(200);
    const moved = await call(prisma, 'team.updateWebhook', users.admin!, gate, { teamId: ids.team, webhookId: created.data.id, url: 'https://rebound.example.com/hook' }, true);
    expect(moved.status).toBe(400);
    expect((await prisma.teamWebhook.findUnique({ where: { id: created.data.id } }))?.url).toBe('https://antenne.facile.studio/webhook/glouton');

    await prisma.teamWebhook.update({ where: { id: created.data.id }, data: { url: 'https://rebound.example.com/hook' } });
    await dispatchWebhookEvent({ event: 'hunt.digest', teamId: ids.team, data: {} });
    expect(received).toHaveLength(0);
    await prisma.teamWebhook.delete({ where: { id: created.data.id } });
  });
});
