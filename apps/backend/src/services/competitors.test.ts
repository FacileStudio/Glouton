import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';

const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch');
const { appRouter, competitorRules } = await import('@repo/trpc');
const { closure, winRate, domainOf, ClosureError } = competitorRules;

const silent = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {}, child: () => silent };
const verdict = { allowed: true, enforced: true, upgradeUrl: 'https://sso.test/spaces' };

/** A gate reader that treats the listed teams as the caller's, with every plan allowed. */
function reader(teams: string[]) {
  return {
    team: async (_userId: string, teamId: string) => (teams.includes(teamId) ? verdict : null),
    personal: async () => verdict,
    entitledScopes: async () => ({ personal: true, teamIds: teams }),
  };
}

type User = { id: string; email: string; role: string };
type Data = { id: string; items: Data[]; wonLeads: Data[]; lostLeads: Data[]; [key: string]: unknown };

/** Calls one procedure over HTTP with the real database and a fixed gate reader. */
async function call(prisma: PrismaClient, path: string, user: User, teams: string[], input: unknown, mutation = false) {
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
  const body = (await res.json()) as { result?: { data?: Data } };
  return { status: res.status, data: body.result?.data as Data };
}

describe('close rules', () => {
  test('a loss needs a reason, and a loss to a competitor needs the competitor and why', () => {
    expect(() => closure({ outcome: 'LOST' })).toThrow(ClosureError);
    expect(() => closure({ outcome: 'LOST', lossReason: 'LOST_TO_COMPETITOR' })).toThrow('lostToCompetitorId');
    expect(() => closure({ outcome: 'LOST', lossReason: 'LOST_TO_COMPETITOR', lostToCompetitorId: 'c' })).toThrow('competitorLossReason');
    expect(closure({ outcome: 'LOST', lossReason: 'LOST_TO_COMPETITOR', lostToCompetitorId: 'c', competitorLossReason: 'PRICE' })).toEqual({
      outcome: 'LOST',
      lossReason: 'LOST_TO_COMPETITOR',
      lostToCompetitorId: 'c',
      competitorLossReason: 'PRICE',
      wonAgainstCompetitorId: null,
    });
  });

  test('fields that do not fit the outcome are dropped', () => {
    expect(closure({ outcome: 'LOST', lossReason: 'PRICE', lostToCompetitorId: 'c', competitorLossReason: 'BRAND' })).toMatchObject({
      lostToCompetitorId: null,
      competitorLossReason: null,
    });
    expect(closure({ outcome: 'WON', lossReason: 'PRICE', lostToCompetitorId: 'c', wonAgainstCompetitorId: 'd' })).toMatchObject({
      lossReason: null,
      lostToCompetitorId: null,
      wonAgainstCompetitorId: 'd',
    });
  });
});

describe('win rate', () => {
  test('is the share of closed deals won, with the counts, and null without deals', () => {
    expect(winRate(0, 0)).toEqual({ won: 0, lost: 0, total: 0, rate: null });
    expect(winRate(1, 2)).toEqual({ won: 1, lost: 2, total: 3, rate: 33.3 });
    expect(winRate(3, 0).rate).toBe(100);
  });

  test('domains are matched without scheme, www or case', () => {
    expect(domainOf('https://WWW.Rival.fr/pricing')).toBe('rival.fr');
    expect(domainOf('rival.fr')).toBe('rival.fr');
    expect(domainOf('  ')).toBeNull();
  });
});

describe.skipIf(!databaseUrl)('competitors on the database', () => {
  let prisma: PrismaClient;
  const tag = crypto.randomUUID();
  let alice: User;
  let bob: User;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    prisma = (await import('@repo/database')).prisma;
    const a = await prisma.user.create({ data: { email: `a-${tag}@x.test`, firstName: 'A', lastName: 'A', password: 'x' } });
    const b = await prisma.user.create({ data: { email: `b-${tag}@x.test`, firstName: 'B', lastName: 'B', password: 'x' } });
    alice = { id: a.id, email: a.email, role: 'USER' };
    bob = { id: b.id, email: b.email, role: 'USER' };
    ids.teamA = (await prisma.team.create({ data: { name: `a-${tag}` } })).id;
    ids.teamB = (await prisma.team.create({ data: { name: `b-${tag}` } })).id;
    await prisma.teamMember.createMany({
      data: [
        { teamId: ids.teamA, userId: a.id, role: 'OWNER' },
        { teamId: ids.teamB, userId: b.id, role: 'OWNER' },
      ],
    });
    ids.leadWon = (await prisma.lead.create({ data: { userId: a.id, teamId: ids.teamA, domain: `w-${tag}.test` } })).id;
    ids.leadLost = (await prisma.lead.create({ data: { userId: a.id, teamId: ids.teamA, domain: `l-${tag}.test` } })).id;
    ids.leadOther = (await prisma.lead.create({ data: { userId: a.id, teamId: ids.teamA, domain: `o-${tag}.test` } })).id;
    ids.leadB = (await prisma.lead.create({ data: { userId: b.id, teamId: ids.teamB, domain: `b-${tag}.test` } })).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.team.deleteMany({ where: { id: { in: [ids.teamA!, ids.teamB!] } } });
    await prisma.user.deleteMany({ where: { email: { in: [alice.email, bob.email] } } });
  }, 60_000);

  test('a member creates a competitor with a battlecard in their team', async () => {
    const created = await call(prisma, 'competitor.create', alice, [ids.teamA!], {
      teamId: ids.teamA,
      name: 'Rival',
      website: 'https://www.rival.test',
      tags: ['agency', 'Agency', 'local'],
      whyWeWin: ['Faster delivery'],
      objections: [{ objection: 'Too expensive', response: 'Total cost is lower', proof: 'Case study' }],
      landmines: ['Ask how long their last migration took'],
    }, true);
    expect(created.status).toBe(200);
    expect(created.data).toMatchObject({ teamId: ids.teamA, domain: 'rival.test', tags: ['agency', 'local'] });
    expect(created.data.objections).toEqual([{ objection: 'Too expensive', response: 'Total cost is lower', proof: 'Case study' }]);
    ids.rival = created.data.id;
    const other = await call(prisma, 'competitor.create', alice, [ids.teamA!], { teamId: ids.teamA, name: 'Other' }, true);
    ids.other = other.data.id;
    const mine = await call(prisma, 'competitor.create', bob, [ids.teamB!], { teamId: ids.teamB, name: 'Bob rival' }, true);
    ids.bobRival = mine.data.id;
    const personal = await call(prisma, 'competitor.create', alice, [], { name: 'Personal rival' }, true);
    expect(personal.data.teamId).toBeNull();
    ids.personal = personal.data.id;
  });

  test('another team cannot read or write the competitor', async () => {
    const refused: Array<[string, unknown, boolean]> = [
      ['competitor.get', { competitorId: ids.rival }, false],
      ['competitor.update', { competitorId: ids.rival, name: 'Hacked' }, true],
      ['competitor.delete', { competitorId: ids.rival }, true],
      ['competitor.list', { teamId: ids.teamA }, false],
      ['competitor.get', { competitorId: ids.personal }, false],
    ];
    for (const [path, input, mutation] of refused) {
      const res = await call(prisma, path, bob, [ids.teamB!], input, mutation);
      expect({ path, refused: res.status === 403 || res.status === 404 }).toEqual({ path, refused: true });
    }
    const compare = await call(prisma, 'competitor.compare', bob, [ids.teamB!], { teamId: ids.teamB, competitorIds: [ids.bobRival, ids.rival] });
    expect(compare.status).toBe(404);
    const closeWithForeign = await call(prisma, 'competitor.closeLead', bob, [ids.teamB!], {
      leadId: ids.leadB,
      outcome: 'LOST',
      lossReason: 'LOST_TO_COMPETITOR',
      lostToCompetitorId: ids.rival,
      competitorLossReason: 'PRICE',
    }, true);
    expect(closeWithForeign.status).toBe(404);
    expect((await prisma.competitor.findUnique({ where: { id: ids.rival } }))?.name).toBe('Rival');
  });

  test('the service refuses a non-member even when the gate lets the call through', async () => {
    const forgedGate = [ids.teamA!, ids.teamB!];
    expect((await call(prisma, 'competitor.get', bob, forgedGate, { competitorId: ids.rival })).status).toBe(403);
    expect((await call(prisma, 'competitor.update', bob, forgedGate, { competitorId: ids.rival, name: 'Hacked' }, true)).status).toBe(403);
    expect((await call(prisma, 'competitor.list', bob, forgedGate, { teamId: ids.teamA })).status).toBe(403);
  });

  test('closing as lost to a competitor requires the competitor and the reason', async () => {
    const base = { leadId: ids.leadLost, outcome: 'LOST' };
    expect((await call(prisma, 'competitor.closeLead', alice, [ids.teamA!], base, true)).status).toBe(400);
    expect((await call(prisma, 'competitor.closeLead', alice, [ids.teamA!], { ...base, lossReason: 'LOST_TO_COMPETITOR' }, true)).status).toBe(400);
    expect(
      (await call(prisma, 'competitor.closeLead', alice, [ids.teamA!], { ...base, lossReason: 'LOST_TO_COMPETITOR', lostToCompetitorId: ids.rival }, true)).status
    ).toBe(400);
    const ok = await call(prisma, 'competitor.closeLead', alice, [ids.teamA!], {
      ...base,
      lossReason: 'LOST_TO_COMPETITOR',
      lostToCompetitorId: ids.rival,
      competitorLossReason: 'PRICE',
    }, true);
    expect(ok.status).toBe(200);
    expect(ok.data).toMatchObject({ outcome: 'LOST', lostToCompetitorId: ids.rival, competitorLossReason: 'PRICE' });
    const won = await call(prisma, 'competitor.closeLead', alice, [ids.teamA!], { leadId: ids.leadWon, outcome: 'WON', wonAgainstCompetitorId: ids.rival }, true);
    expect(won.status).toBe(200);
    const price = await call(prisma, 'competitor.closeLead', alice, [ids.teamA!], {
      leadId: ids.leadOther,
      outcome: 'LOST',
      lossReason: 'PRICE',
      lostToCompetitorId: ids.other,
    }, true);
    expect(price.data).toMatchObject({ lossReason: 'PRICE', lostToCompetitorId: null });
  });

  test('the win rate counts the deals won and lost against each competitor', async () => {
    const card = await call(prisma, 'competitor.get', alice, [ids.teamA!], { competitorId: ids.rival });
    expect(card.status).toBe(200);
    expect(card.data.winRate).toEqual({ won: 1, lost: 1, total: 2, rate: 50 });
    expect(card.data.wonLeads.map((l) => l.id)).toEqual([ids.leadWon]);
    expect(card.data.lostLeads.map((l) => l.id)).toEqual([ids.leadLost]);
    expect(card.data.lossReasons).toEqual([{ reason: 'PRICE', count: 1 }]);
    const list = await call(prisma, 'competitor.list', alice, [ids.teamA!], { teamId: ids.teamA });
    const other = list.data.items.find((c) => c.id === ids.other);
    expect(other?.winRate).toEqual({ won: 0, lost: 0, total: 0, rate: null });
    expect(list.data.tags).toEqual(['agency', 'local']);
    const compared = await call(prisma, 'competitor.compare', alice, [ids.teamA!], { teamId: ids.teamA, competitorIds: [ids.other, ids.rival] });
    expect((compared.data as unknown as Data[]).map((c) => c.id)).toEqual([ids.other, ids.rival]);
    const reopened = await call(prisma, 'competitor.reopenLead', alice, [ids.teamA!], { leadId: ids.leadWon }, true);
    expect(reopened.data.outcome).toBeNull();
    const after = await call(prisma, 'competitor.get', alice, [ids.teamA!], { competitorId: ids.rival });
    expect(after.data.winRate).toEqual({ won: 0, lost: 1, total: 1, rate: 0 });
  });
});
