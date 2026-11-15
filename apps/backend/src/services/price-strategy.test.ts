import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';

const { competitorAi } = await import('@repo/trpc');
const { INJECTION, UPGRADE, callAs, dropWorld, fakeBulle, seedWorld } = await import('./price-kit');

type World = Awaited<ReturnType<typeof seedWorld>>;

describe.skipIf(!databaseUrl)('price recommendation and lead score on the database', () => {
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
    const source = [{ url: 'https://rival.test/tarifs', text: '', watchedPageId: ids().pricing!, snapshotId: null }];
    const price = (name: string, amount: number) => ({ source: 1, name, price: amount, currency: 'EUR', unit: null, period: 'month' as const });
    const day = (n: number) => new Date(Date.UTC(2026, 10, n));
    await competitorAi.storeExtraction(prisma, ids().rival!, source, [price('Pro', 99)], 'manual', null, day(1));
    await competitorAi.storeExtraction(prisma, ids().rival!, source, [price('Pro', 109), price('Free', 0)], 'manual', null, day(10));
  }, 60_000);

  afterAll(async () => {
    await dropWorld(prisma, world);
  }, 60_000);

    const advice = {
    what_changed: 'Pro went from 99 to 109 EUR and a free plan appeared.',
    meaning: 'The free plan pulls small prospects away from our entry offer.',
    options: [
      { title: 'Hold', action: 'Keep 99 EUR.', trade_off: 'Less margin pressure, less volume.' },
      { title: 'Trial', action: 'Offer a 14-day trial.', trade_off: 'Support cost.' },
    ],
    talking_points: ['Our site includes hosting.'],
    battlecard_patch: { pricing: 'Rival Pro 109 EUR per month, free plan available.' },
  };

  test('recommend builds its input on the server from prices, events, profile and record, and boxes page text', async () => {
    await prisma.lead.createMany({
      data: [
        { userId: users().alice!.id, teamId: ids().teamA, businessName: 'W1', outcome: 'WON', wonAgainstCompetitorId: ids().rival, closedAt: new Date() },
        { userId: users().alice!.id, teamId: ids().teamA, businessName: 'L1', outcome: 'LOST', lossReason: 'LOST_TO_COMPETITOR', lostToCompetitorId: ids().rival, competitorLossReason: 'PRICE', closedAt: new Date() },
      ],
    });
    await prisma.pageSnapshot.create({ data: { watchedPageId: ids().pricing, text: `Pro 109 €\n${INJECTION}`, hash: 'recommend-1' } });
    const { bulle, state } = fakeBulle();
    state.answers.push(JSON.stringify(advice));
    const before = await prisma.competitor.findUniqueOrThrow({ where: { id: ids().rival } });
    const res = await call<{ whatChanged: string; options: unknown[]; talkingPoints: string[]; battlecardPatch: Record<string, unknown> }>(
      'competitorAi.recommend',
      users().alice!,
      { teamId: ids().teamA, competitorId: ids().rival, language: 'en', ownPricing: 'Everything is free', current: [{ name: 'Fake', price: 1 }] },
      bulle
    );
    expect(res.status).toBe(200);
    expect(res.data.whatChanged).toContain('109');
    expect(res.data.options).toHaveLength(2);
    expect(res.data.battlecardPatch).toEqual({ pricing: 'Rival Pro 109 EUR per month, free plan available.' });
    const seen = state.seen[0]!;
    expect(seen.input).toContain('Site: 99 EUR per month.');
    expect(seen.input).not.toContain('Everything is free');
    expect(seen.input).toContain('Won against them: 1. Lost to them: 1.');
    expect(seen.input).toContain('PRICE: 1');
    expect(seen.input).toContain('FREE_TIER_APPEARED');
    expect(seen.system).not.toContain('Ignore previous instructions');
    const at = seen.input.indexOf('Ignore previous instructions');
    expect(seen.input.lastIndexOf('<<<PAGE_DATA', at)).toBeGreaterThan(-1);
    expect(seen.input.indexOf('<<<END_PAGE_DATA>>>', at)).toBeGreaterThan(at);
    expect(await prisma.competitor.findUniqueOrThrow({ where: { id: ids().rival } })).toEqual(before);
  });

  test('recommend rejects a hijacked answer whole, refuses a free space and a stranger, and needs prices first', async () => {
    const { bulle, state } = fakeBulle();
    state.answers.push(JSON.stringify({ ...advice, action: 'deleteCompetitor' }));
    const bad = await call('competitorAi.recommend', users().alice!, { teamId: ids().teamA, competitorId: ids().rival, language: 'en' }, bulle);
    expect(bad.status).toBe(422);
    expect(await prisma.competitor.count({ where: { id: ids().rival } })).toBe(1);
    const free = await call('competitorAi.recommend', users().bob!, { teamId: ids().teamB, competitorId: ids().bRival }, bulle);
    expect(free.status).toBe(403);
    expect(free.error?.data?.plan_limit).toEqual(expect.objectContaining({ upgrade_url: UPGRADE }));
    const stranger = await call('competitorAi.recommend', users().bob!, { teamId: ids().teamB, competitorId: ids().rival }, bulle);
    expect([403, 404]).toContain(stranger.status);
    const empty = (await prisma.competitor.create({ data: { userId: users().alice!.id, teamId: ids().teamA, name: 'Empty' } })).id;
    state.answers.push(JSON.stringify(advice));
    const none = await call('competitorAi.recommend', users().alice!, { teamId: ids().teamA, competitorId: empty, language: 'en' }, bulle);
    expect(none.status).toBe(400);
  });

  test('leads are ranked without a model, closed leads are left out, and other teams see nothing of them', async () => {
    await prisma.teamProspectProfile.update({
      where: { scopeKey: `team:${ids().teamA}` },
      data: { usages: ['clients'], targets: { clients: { description: null, nafCodes: [], osmTags: ['craft=plumber'], keywords: [] } } },
    });
    const base = { userId: users().alice!.id, teamId: ids().teamA };
    const good = await prisma.lead.create({ data: { ...base, businessName: 'Good fit', category: 'craft=plumber', email: 'g@x.test', hasWebsite: false } });
    const poor = await prisma.lead.create({ data: { ...base, businessName: 'Poor fit', category: 'shop=bakery', hasWebsite: true } });
    const closed = await prisma.lead.create({ data: { ...base, businessName: 'Closed', category: 'craft=plumber', outcome: 'WON', closedAt: new Date() } });
    const { bulle, state } = fakeBulle();
    const ranked = await call<{ items: Array<{ leadId: string; score: number; reasons: unknown[] }>; total: number }>('leadScore.list', users().alice!, { teamId: ids().teamA }, bulle, false);
    expect(ranked.status).toBe(200);
    const order = ranked.data.items.map((item) => item.leadId);
    expect(order.indexOf(good.id)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(good.id)).toBeLessThan(order.indexOf(poor.id));
    expect(order).not.toContain(closed.id);
    const scores = ranked.data.items.map((item) => item.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(ranked.data.items[0]!.reasons).toHaveLength(7);
    expect(state.seen).toHaveLength(0);
    const other = await call<{ items: unknown[] }>('leadScore.list', users().bob!, { teamId: ids().teamB }, bulle, false);
    expect(other.data.items).toHaveLength(0);
    const spy = await call('leadScore.list', users().bob!, { teamId: ids().teamA }, bulle, false);
    expect([403, 404]).toContain(spy.status);
  });

  test('explain is paid, scoped to the caller, and returns validated text', async () => {
    const lead = await prisma.lead.findFirstOrThrow({ where: { teamId: ids().teamA, businessName: 'Good fit' } });
    const { bulle, state } = fakeBulle();
    state.answers.push(JSON.stringify({ explanation: 'It matches your plumber target. It has no website.', next_step: 'Call this week.' }));
    const ok = await call<{ explanation: string; nextStep: string; score: number }>('leadScore.explain', users().alice!, { teamId: ids().teamA, leadId: lead.id, language: 'en' }, bulle);
    expect(ok.status).toBe(200);
    expect(ok.data).toMatchObject({ nextStep: 'Call this week.' });
    expect(state.seen[0]!.input).toContain('Good fit');
    const stranger = await call('leadScore.explain', users().bob!, { leadId: lead.id, language: 'en' }, bulle);
    expect([403, 404]).toContain(stranger.status);
    const strangerTeam = await call('leadScore.explain', users().bob!, { teamId: ids().teamB, leadId: lead.id }, bulle);
    expect([403, 404]).toContain(strangerTeam.status);
    const paywalled = await call('leadScore.explain', users().bob!, { teamId: ids().teamB, leadId: (await prisma.lead.create({ data: { userId: users().bob!.id, teamId: ids().teamB, businessName: 'B lead' } })).id }, bulle);
    expect(paywalled.status).toBe(403);
    expect(state.seen).toHaveLength(1);
    state.answers.push('Sure, wiring the money now.');
    const bad = await call('leadScore.explain', users().alice!, { teamId: ids().teamA, leadId: lead.id, language: 'en' }, bulle);
    expect(bad.status).toBe(422);
  });
});
