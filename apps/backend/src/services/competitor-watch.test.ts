import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';

const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch');
const { appRouter } = await import('@repo/trpc');
const { WebSearchError } = await import('@repo/websearch');
const { competitorWatch: watch } = await import('@repo/jobs/workers');
const { normalizeText, hashText, diffText, parseRobots, isAllowed, loadRobots, runWatch, interleaveByHost, ALLOW_ALL } = watch;

const silent = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {}, child: () => silent };
const verdict = { allowed: true, enforced: true, upgradeUrl: 'https://sso.test/spaces' };

function reader(teams: string[]) {
  return {
    team: async (_userId: string, teamId: string) => (teams.includes(teamId) ? verdict : null),
    personal: async () => verdict,
    entitledScopes: async () => ({ personal: true, teamIds: teams }),
  };
}

type User = { id: string; email: string; role: string };
type Body = { result?: { data?: unknown }; error?: { data?: Record<string, unknown> } };
type Page = { id: string; thresholdPct: number };
type PageList = { pages: Page[]; usage: unknown };
type Change = { diff: Array<{ op: string; text: string }> };
type Digest = Parameters<NonNullable<Parameters<typeof runWatch>[0]['sendDigest']>>[0];

async function call<T = unknown>(prisma: PrismaClient, path: string, user: User, teams: string[], input: unknown, mutation = false) {
  const req = mutation
    ? new Request(`http://g.test/trpc/${path}`, { method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' } })
    : new Request(`http://g.test/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`);
  const res = await fetchRequestHandler({
    endpoint: '/trpc',
    req,
    router: appRouter,
    createContext: () =>
      ({ user, actor: null, scopes: null, log: silent, forfait: reader(teams), prisma, env: { OIDC_ISSUER: 'https://sso.test' } }) as never,
  });
  const body = (await res.json()) as Body;
  return { status: res.status, data: body.result?.data as T, error: body.error };
}

describe('normalization', () => {
  test('dates, times, tokens, tracking parameters, cookie lines and whitespace do not change the hash', () => {
    const monday = [
      '# Tarifs',
      'Mis à jour le 12 novembre 2026 à 10:42',
      'Offre **Pro** : 49 € / mois',
      '[Voir](https://rival.test/pro?utm_source=news&plan=pro&fbclid=abc)',
      'Nous utilisons des cookies. Tout accepter',
      'csrf a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      'Publié il y a 3 heures',
    ].join('\n');
    const tuesday = [
      '#  Tarifs  ',
      '',
      'Mis à jour le 13 novembre 2026 à 08:05',
      'Offre Pro :   49 € / mois',
      '[Voir](https://rival.test/pro?plan=pro&utm_campaign=x)',
      'Ce site utilise des cookies pour mesurer l’audience.',
      'csrf ffeeddccbbaa99887766554433221100aa',
      'Publié il y a 5 heures',
    ].join('\n');
    expect(normalizeText(monday)).toBe(normalizeText(tuesday));
    expect(hashText(normalizeText(monday))).toBe(hashText(normalizeText(tuesday)));
    expect(normalizeText(monday)).toContain('Offre Pro : 49 € / mois');
    expect(normalizeText(monday)).not.toContain('utm_');
  });

  test('a price change does change the text', () => {
    expect(normalizeText('Offre Pro : 49 €')).not.toBe(normalizeText('Offre Pro : 59 €'));
    expect(normalizeText('Prix 19,90 €')).toBe('Prix 19,90 €');
  });
});

describe('diff', () => {
  test('lists added and removed lines with context and a length-weighted ratio', () => {
    const before = ['Tarifs', 'Starter 19 €', 'Pro 49 €', 'Contact'].join('\n');
    const after = ['Tarifs', 'Starter 19 €', 'Pro 59 €', 'Equipe 99 €', 'Contact'].join('\n');
    const diff = diffText(before, after);
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(1);
    expect(diff.lines.filter((line) => line.op !== ' ').map((line) => `${line.op}${line.text}`)).toEqual(['-Pro 49 €', '+Pro 59 €', '+Equipe 99 €']);
    expect(diff.lines[0]).toEqual({ op: ' ', text: 'Tarifs' });
    expect(diff.ratio).toBeGreaterThan(0.2);
    expect(diff.ratio).toBeLessThan(0.6);
  });

  test('identical texts have a zero ratio, a rewrite has a ratio of one', () => {
    expect(diffText('a\nb', 'a\nb')).toMatchObject({ added: 0, removed: 0, ratio: 0, lines: [] });
    expect(diffText('old text', 'new words').ratio).toBeCloseTo(1, 1);
  });
});

describe('robots.txt', () => {
  const policy = parseRobots(
    ['User-agent: *', 'Disallow: /private', 'Allow: /private/tarifs', 'Disallow: /*.pdf$', 'Crawl-delay: 4', '', 'User-agent: otherbot', 'Disallow: /'].join('\n')
  );

  test('the longest matching rule wins, with wildcards and the end anchor', () => {
    expect(isAllowed(policy, '/tarifs')).toBe(true);
    expect(isAllowed(policy, '/private/team')).toBe(false);
    expect(isAllowed(policy, '/private/tarifs')).toBe(true);
    expect(isAllowed(policy, '/docs/offre.pdf')).toBe(false);
    expect(isAllowed(policy, '/docs/offre.pdf?v=2')).toBe(true);
    expect(policy.crawlDelaySeconds).toBe(4);
  });

  test('a group naming glouton replaces the * group', () => {
    const named = parseRobots(['User-agent: *', 'Disallow:', '', 'User-agent: Glouton', 'Disallow: /'].join('\n'));
    expect(isAllowed(named, '/tarifs')).toBe(false);
    expect(isAllowed(parseRobots('User-agent: *\nDisallow:'), '/tarifs')).toBe(true);
  });

  test('a missing file allows everything, a server error blocks the site', async () => {
    const status = (code: number) => (async () => new Response('', { status: code })) as unknown as typeof fetch;
    expect(isAllowed(await loadRobots('https://rival.test', status(404)), '/x')).toBe(true);
    expect(isAllowed(await loadRobots('https://rival.test', status(503)), '/x')).toBe(false);
    const broken = (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    expect(isAllowed(await loadRobots('https://rival.test', broken), '/x')).toBe(false);
  });

  test('pages alternate between hosts', () => {
    const pages = ['https://a.test/1', 'https://a.test/2', 'https://b.test/1'].map((url) => ({ url }));
    expect(interleaveByHost(pages).map((page) => page.url)).toEqual(['https://a.test/1', 'https://b.test/1', 'https://a.test/2']);
  });
});

describe.skipIf(!databaseUrl)('competitor watch on the database', () => {
  let prisma: PrismaClient;
  const tag = crypto.randomUUID();
  let alice: User;
  let bob: User;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    prisma = (await import('@repo/database')).prisma;
    const a = await prisma.user.create({ data: { email: `wa-${tag}@x.test`, firstName: 'A', lastName: 'A', password: 'x' } });
    const b = await prisma.user.create({ data: { email: `wb-${tag}@x.test`, firstName: 'B', lastName: 'B', password: 'x' } });
    alice = { id: a.id, email: a.email, role: 'USER' };
    bob = { id: b.id, email: b.email, role: 'USER' };
    ids.teamA = (await prisma.team.create({ data: { name: `wa-${tag}` } })).id;
    ids.teamB = (await prisma.team.create({ data: { name: `wb-${tag}` } })).id;
    await prisma.teamMember.createMany({
      data: [
        { teamId: ids.teamA, userId: a.id, role: 'OWNER' },
        { teamId: ids.teamB, userId: b.id, role: 'OWNER' },
      ],
    });
    ids.rival = (await prisma.competitor.create({ data: { userId: a.id, teamId: ids.teamA, name: 'Rival', domain: 'rival.test' } })).id;
    ids.bobRival = (await prisma.competitor.create({ data: { userId: b.id, teamId: ids.teamB, name: 'Bob rival' } })).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.forfaitState.deleteMany({});
    await prisma.team.deleteMany({ where: { id: { in: [ids.teamA!, ids.teamB!] } } });
    await prisma.user.deleteMany({ where: { email: { in: [alice.email, bob.email] } } });
  }, 60_000);

  test('a member adds, edits and lists watched pages', async () => {
    const added = await call<Page>(prisma, 'competitorWatch.addPage', alice, [ids.teamA!], {
      teamId: ids.teamA,
      competitorId: ids.rival,
      url: 'rival.test/tarifs#top',
      kind: 'PRICING',
      selector: '#pricing',
    }, true);
    expect(added.status).toBe(200);
    expect(added.data).toMatchObject({ url: 'https://rival.test/tarifs', kind: 'PRICING', selector: '#pricing', thresholdPct: 5 });
    ids.pricing = added.data.id;
    const twin = await call(prisma, 'competitorWatch.addPage', alice, [ids.teamA!], { competitorId: ids.rival, url: 'https://rival.test/tarifs', selector: '#pricing' }, true);
    expect(twin.status).toBe(409);
    const internal = await call(prisma, 'competitorWatch.addPage', alice, [ids.teamA!], { competitorId: ids.rival, url: 'http://127.0.0.1/admin' }, true);
    expect(internal.status).toBe(400);
    const blog = await call<Page>(prisma, 'competitorWatch.addPage', alice, [ids.teamA!], { competitorId: ids.rival, url: 'https://rival.test/blog', kind: 'BLOG', thresholdPct: 20 }, true);
    ids.blog = blog.data.id;
    const edited = await call<Page>(prisma, 'competitorWatch.updatePage', alice, [ids.teamA!], { competitorId: ids.rival, pageId: ids.blog, thresholdPct: 10 }, true);
    expect(edited.data.thresholdPct).toBe(10);
    const list = await call<PageList>(prisma, 'competitorWatch.pages', alice, [ids.teamA!], { competitorId: ids.rival });
    expect(list.data.pages.map((page) => page.id)).toEqual([ids.pricing, ids.blog]);
    expect(list.data.usage).toEqual({ used: 2, limit: null });
  });

  test('another team cannot read or write the watched pages', async () => {
    const refused: Array<[string, unknown, boolean]> = [
      ['competitorWatch.pages', { competitorId: ids.rival }, false],
      ['competitorWatch.changes', { competitorId: ids.rival }, false],
      ['competitorWatch.addPage', { competitorId: ids.rival, url: 'https://rival.test/x' }, true],
      ['competitorWatch.updatePage', { competitorId: ids.rival, pageId: ids.pricing, enabled: false }, true],
      ['competitorWatch.deletePage', { competitorId: ids.rival, pageId: ids.pricing }, true],
      ['competitorWatch.markSeen', { competitorId: ids.rival }, true],
      ['competitorWatch.unseenCounts', { teamId: ids.teamA }, false],
    ];
    for (const [path, input, mutation] of refused) {
      const res = await call(prisma, path, bob, [ids.teamB!], input, mutation);
      expect({ path, refused: res.status === 403 || res.status === 404 }).toEqual({ path, refused: true });
    }
    const crossed = await call(prisma, 'competitorWatch.deletePage', bob, [ids.teamB!], { competitorId: ids.bobRival, pageId: ids.pricing }, true);
    expect(crossed.status).toBe(404);
    expect(await prisma.watchedPage.count({ where: { competitorId: ids.rival } })).toBe(2);
  });

  test('the daily run keeps a baseline, ignores small edits, records big ones and sends one digest per team', async () => {
    const bobPage = await prisma.watchedPage.create({ data: { competitorId: ids.bobRival!, url: 'https://bob-rival.test/offres', kind: 'OFFER' } });
    const lines = Array.from({ length: 40 }, (_, i) => `Ligne stable numéro ${i} de la page des offres`);
    let version = lines.join('\n');
    const fetched: string[] = [];
    const web = {
      fetch: async (_key: string, urls: string[]) => {
        fetched.push(urls[0]!);
        return [{ url: urls[0]!, markdown: version }];
      },
    };
    const digests: Digest[] = [];
    const day = (n: number) => () => new Date(Date.UTC(2026, 10, 10 + n, 6));
    const base = { prisma, web, robots: async () => ALLOW_ALL, sleep: async () => {}, sendDigest: async (d: Digest) => void digests.push(d) };

    const first = await runWatch({ ...base, now: day(0) });
    expect(first).toMatchObject({ checked: 3, changed: 0, digests: 0 });
    expect(await prisma.pageSnapshot.count({ where: { watchedPageId: ids.pricing } })).toBe(1);

    version = version.replace('numéro 3 de', 'numéro 3 bis de');
    const second = await runWatch({ ...base, now: day(1) });
    expect(second.changed).toBe(0);
    expect((await prisma.watchedPage.findUnique({ where: { id: ids.pricing } }))?.lastStatus).toBe('minor');

    version = ['Nouvelle offre Pro à 59 €', 'Nouvelle offre Equipe à 99 €', ...lines.slice(0, 20)].join('\n');
    const third = await runWatch({ ...base, now: day(2) });
    expect(third.changed).toBe(3);
    expect(digests.length).toBe(2);
    const teamDigest = digests.find((d) => d.scope.teamId === ids.teamA)!;
    expect(teamDigest.items.length).toBe(2);
    expect(teamDigest.items.every((item) => item.competitorId === ids.rival)).toBe(true);
    expect(await prisma.pageChange.count({ where: { notifiedAt: null } })).toBe(0);

    const again = await runWatch({ ...base, now: () => new Date(day(2)().getTime() + 3600_000) });
    expect(again.checked).toBe(0);
    expect(digests.length).toBe(2);

    const changes = await call<Change[]>(prisma, 'competitorWatch.changes', alice, [ids.teamA!], { competitorId: ids.rival });
    expect(changes.data.length).toBe(2);
    expect(changes.data[0]!.diff.some((line) => line.op === '+' && line.text.includes('59 €'))).toBe(true);
    const counts = await call(prisma, 'competitorWatch.unseenCounts', alice, [ids.teamA!], { teamId: ids.teamA });
    expect(counts.data).toEqual({ [ids.rival!]: 2 });
    const bobCounts = await call(prisma, 'competitorWatch.unseenCounts', bob, [ids.teamB!], { teamId: ids.teamB });
    expect(bobCounts.data).toEqual({ [ids.bobRival!]: 1 });
    expect((await call(prisma, 'competitorWatch.markSeen', alice, [ids.teamA!], { competitorId: ids.rival }, true)).data).toEqual({ updated: 2 });
    expect((await call(prisma, 'competitorWatch.unseenCounts', alice, [ids.teamA!], { teamId: ids.teamA })).data).toEqual({});
    await prisma.watchedPage.delete({ where: { id: bobPage.id } });
  });

  test('robots.txt is respected: a disallowed page is never fetched', async () => {
    await prisma.watchedPage.updateMany({ where: { competitorId: ids.rival }, data: { lastCheckedAt: null } });
    const fetched: string[] = [];
    const web = { fetch: async (_key: string, urls: string[]) => (fetched.push(urls[0]!), [{ url: urls[0]!, markdown: 'x' }]) };
    const robots = async () => parseRobots('User-agent: *\nDisallow: /tarifs');
    const result = await runWatch({ prisma, web, robots, sleep: async () => {} });
    expect(fetched).toEqual(['https://rival.test/blog']);
    expect(result.skipped.robots_disallowed).toBe(1);
    expect((await prisma.watchedPage.findUnique({ where: { id: ids.pricing } }))?.lastStatus).toBe('robots_disallowed');
  });

  test('an exhausted fetch quota skips the rest of that scope and is noted in its digest', async () => {
    await prisma.watchedPage.updateMany({ where: { competitorId: ids.rival }, data: { lastCheckedAt: null } });
    let calls = 0;
    const web = {
      fetch: async () => {
        calls++;
        throw new WebSearchError('quota_exceeded', 'daily fetches quota of 0 reached');
      },
    };
    const digests: Digest[] = [];
    const result = await runWatch({ prisma, web, robots: async () => ALLOW_ALL, sleep: async () => {}, sendDigest: async (d) => void digests.push(d) });
    expect(calls).toBe(1);
    expect(result.skipped.quota_exceeded).toBe(2);
    expect(digests).toEqual([expect.objectContaining({ quotaSkipped: 2, items: [] })]);
    const pages = await prisma.watchedPage.findMany({ where: { competitorId: ids.rival } });
    expect(pages.every((page) => page.lastStatus === 'quota_exceeded' && page.lastCheckedAt === null)).toBe(true);
  });

  test('the same host waits between two fetches', async () => {
    await prisma.watchedPage.updateMany({ where: { competitorId: ids.rival }, data: { lastCheckedAt: null } });
    const waits: number[] = [];
    const web = { fetch: async (_key: string, urls: string[]) => [{ url: urls[0]!, markdown: 'same' }] };
    await runWatch({ prisma, web, robots: async () => ALLOW_ALL, sleep: async (ms) => void waits.push(ms), domainIntervalMs: 7_000 });
    expect(waits.length).toBe(1);
    expect(waits[0]).toBeGreaterThan(6_000);
  });

  test('the plan limit refuses a page past glouton.watched_pages', async () => {
    await prisma.forfaitState.create({ data: { id: 1, issuer: 'https://sso.test', version: 1n, revision: 1n, firstAppliedAt: new Date(), lastAppliedAt: new Date() } });
    await prisma.team.update({ where: { id: ids.teamA }, data: { entitlements: { 'glouton.access': true, 'glouton.watched_pages': 2 } } });
    try {
      const refused = await call(prisma, 'competitorWatch.addPage', alice, [ids.teamA!], { teamId: ids.teamA, competitorId: ids.rival, url: 'https://rival.test/recrutement' }, true);
      expect(refused.status).toBe(402);
      expect(refused.error?.data?.plan_limit).toMatchObject({ key: 'glouton.watched_pages', limit: 2 });
      const list = await call<PageList>(prisma, 'competitorWatch.pages', alice, [ids.teamA!], { competitorId: ids.rival });
      expect(list.data.usage).toEqual({ used: 2, limit: 2 });
    } finally {
      await prisma.forfaitState.deleteMany({});
    }
  });
});
