import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';

const { competitorAi } = await import('@repo/trpc');
const { competitorWatch } = await import('@repo/jobs/workers');
const { INJECTION, callAs, dropWorld, fakeBulle, reader, seedWorld } = await import('./price-kit');

type World = Awaited<ReturnType<typeof seedWorld>>;
type Digest = Parameters<NonNullable<Parameters<typeof competitorWatch.runWatch>[0]['sendDigest']>>[0];

const priceAnswer = (prices: Array<{ name: string; price: number | null }>) =>
  JSON.stringify({ prices: prices.map((entry) => ({ source: 1, ...entry, currency: 'EUR', unit: null, period: 'month' })) });

describe.skipIf(!databaseUrl)('price history and alerts on the database', () => {
  let prisma: PrismaClient;
  let world: World;
  const tag = crypto.randomUUID();
  const ai = () => ({ [world.ids.teamA!]: true, [world.ids.teamB!]: false });
  const users = () => world.users;
  const ids = () => world.ids;
  const call = <T = unknown>(path: string, user: World['users'][string], input: unknown, bulle: unknown = null, mutation = true) =>
    callAs<T>(prisma, ai(), path, user, input, bulle, mutation);

  beforeAll(async () => {
    prisma = (await import('@repo/database')).prisma;
    world = await seedWorld(prisma, tag);
  }, 60_000);

  afterAll(async () => {
    await dropWorld(prisma, world);
  }, 60_000);

  const stable = Array.from({ length: 40 }, (_, i) => `Ligne stable ${i} de la page`);
  const pages: Record<string, string> = {
    'https://rival.test/tarifs': stable.join('\n'),
    'https://rival.test/blog': stable.join('\n'),
    'https://b-rival.test/tarifs': stable.join('\n'),
  };
  const web = { fetch: async (_key: string, urls: string[]) => [{ url: urls[0]!, markdown: pages[urls[0]!] ?? '' }] };
  const digests: Digest[] = [];
  const calls: Array<{ competitorId: string; changeIds: string[] }> = [];
  const day = (n: number) => () => new Date(Date.UTC(2026, 10, 10 + n, 6));

  function watch(n: number, bulle: unknown, aiByTeam: Record<string, boolean>) {
    const extract = competitorAi.autoPriceExtractor({ prisma, bulle: bulle as never, forfait: reader(aiByTeam), now: day(n) });
    return competitorWatch.runWatch({
      prisma,
      web,
      robots: async () => competitorWatch.ALLOW_ALL,
      sleep: async () => {},
      now: day(n),
      sendDigest: async (digest: Digest) => void digests.push(digest),
      onPriceChange: async (change) => {
        calls.push({ competitorId: change.competitorId, changeIds: change.changeIds });
        return extract(change);
      },
    });
  }

  test('a baseline and an unchanged pricing page never start an extraction', async () => {
    const { bulle, state } = fakeBulle();
    await watch(0, bulle, ai());
    await watch(1, bulle, ai());
    expect(calls).toHaveLength(0);
    expect(state.seen).toHaveLength(0);
  });

  test('a changed pricing page reads its prices once and stores the first extraction without events', async () => {
    const { bulle, state } = fakeBulle();
    state.answers.push(priceAnswer([{ name: 'Starter', price: 49 }, { name: 'Pro', price: 99 }, { name: 'Team', price: 199 }]));
    pages['https://rival.test/tarifs'] = ['Starter 49 €', 'Pro 99 €', 'Team 199 €', ...stable.slice(0, 10), INJECTION].join('\n');
    pages['https://rival.test/blog'] = ['Nouvel article', ...stable.slice(0, 8)].join('\n');
    pages['https://b-rival.test/tarifs'] = ['Plan 10 €', ...stable.slice(0, 8)].join('\n');
    await watch(2, bulle, ai());
    expect(calls.map((call) => call.competitorId).sort()).toEqual([ids().bRival!, ids().rival!].sort());
    expect(state.seen).toHaveLength(1);
    expect(state.seen[0]!.input).toContain(INJECTION);
    expect(state.seen[0]!.system).not.toContain(INJECTION);
    const stored = await prisma.priceExtraction.findMany({ where: { competitorId: ids().rival }, include: { prices: true, events: true } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ trigger: 'watch' });
    expect(stored[0]!.prices.map((row) => row.name).sort()).toEqual(['Pro', 'Starter', 'Team']);
    expect(stored[0]!.events).toEqual([]);
    const change = await prisma.pageChange.findFirstOrThrow({ where: { watchedPageId: ids().pricing } });
    expect(change).toMatchObject({ priceStatus: 'extracted' });
    expect(change.priceAttemptAt).not.toBeNull();
    expect(stored[0]!.changeId).toBe(change.id);
    const blogChange = await prisma.pageChange.findFirstOrThrow({ where: { watchedPageId: ids().blog } });
    expect(blogChange.priceStatus).toBeNull();
  });

  test('a space without ai.access is skipped with the reason on the change', async () => {
    const bChange = await prisma.pageChange.findFirstOrThrow({ where: { watchedPageId: ids().bPricing } });
    expect(bChange.priceStatus).toBe('skipped_no_ai_access');
    expect(await prisma.priceExtraction.count({ where: { competitorId: ids().bRival } })).toBe(0);
  });

  test('the next change stores a second extraction, raises events, and the digest carries them once', async () => {
    const { bulle, state } = fakeBulle();
    state.answers.push(priceAnswer([{ name: 'Free', price: 0 }, { name: 'Starter', price: 49 }, { name: 'Pro', price: 109 }]));
    pages['https://rival.test/tarifs'] = ['Free 0 €', 'Starter 49 €', 'Pro 109 €', ...stable.slice(20, 30)].join('\n');
    digests.length = 0;
    await watch(3, bulle, ai());
    const extractions = await prisma.priceExtraction.findMany({ where: { competitorId: ids().rival }, orderBy: { extractedAt: 'asc' }, include: { prices: true } });
    expect(extractions).toHaveLength(2);
    expect(extractions[0]!.prices.length).toBe(3);
    const events = await prisma.priceEvent.findMany({ where: { competitorId: ids().rival }, orderBy: { kind: 'asc' } });
    expect(events.map((event) => `${event.kind}:${event.plan}`).sort()).toEqual(['FREE_TIER_APPEARED:Free', 'PLAN_REMOVED:Team', 'PRICE_CHANGED:Pro']);
    expect(events.find((event) => event.kind === 'PRICE_CHANGED')).toMatchObject({ oldPrice: 99, newPrice: 109, percent: 10.1 });
    const digest = digests.find((entry) => entry.scope.teamId === ids().teamA)!;
    expect(digest.priceEvents?.map((event) => event.kind).sort()).toEqual(['FREE_TIER_APPEARED', 'PLAN_REMOVED', 'PRICE_CHANGED']);
    expect(await prisma.priceEvent.count({ where: { notifiedAt: null } })).toBe(0);
    digests.length = 0;
    await watch(4, bulle, ai());
    expect(digests.every((entry) => (entry.priceEvents ?? []).length === 0)).toBe(true);
  });

  test('the timeline lists every extraction with its events, newest first, and refuses another team', async () => {
    const res = await call<Array<{ trigger: string; prices: unknown[]; events: Array<{ kind: string }> }>>(
      'competitorAi.priceTimeline',
      users().alice!,
      { teamId: ids().teamA, competitorId: ids().rival },
      null,
      false
    );
    expect(res.status).toBe(200);
    expect(res.data).toHaveLength(2);
    expect(res.data[0]!.events).toHaveLength(3);
    expect(res.data[1]!.events).toHaveLength(0);
    const refused = await call('competitorAi.priceTimeline', users().bob!, { teamId: ids().teamB, competitorId: ids().rival }, null, false);
    expect([403, 404]).toContain(refused.status);
  });

  test('a manual extraction adds to the history instead of replacing it', async () => {
    const { bulle, state } = fakeBulle();
    state.answers.push(priceAnswer([{ name: 'Free', price: 0 }, { name: 'Starter', price: 49 }, { name: 'Pro', price: 109 }]));
    const res = await call<unknown[]>('competitorAi.extractPrices', users().alice!, { teamId: ids().teamA, competitorId: ids().rival, language: 'en' }, bulle);
    expect(res.status).toBe(200);
    expect(res.data).toHaveLength(3);
    expect(await prisma.priceExtraction.count({ where: { competitorId: ids().rival } })).toBe(3);
    expect(await prisma.competitorPrice.count({ where: { competitorId: ids().rival } })).toBe(9);
    const listed = await call<unknown[]>('competitorAi.prices', users().alice!, { teamId: ids().teamA, competitorId: ids().rival }, null, false);
    expect(listed.data).toHaveLength(3);
    expect(await prisma.priceEvent.count({ where: { competitorId: ids().rival } })).toBe(3);
  });

  test('prices written before history was kept still read as the current list', async () => {
    const legacy = (await prisma.competitor.create({ data: { userId: users().alice!.id, teamId: ids().teamA, name: 'Legacy' } })).id;
    await prisma.competitorPrice.create({ data: { competitorId: legacy, name: 'Old plan', price: 10, sourceUrl: 'https://legacy.test' } });
    const listed = await call<Array<{ name: string }>>('competitorAi.prices', users().alice!, { teamId: ids().teamA, competitorId: legacy }, null, false);
    expect(listed.data.map((row) => row.name)).toEqual(['Old plan']);
  });
});
