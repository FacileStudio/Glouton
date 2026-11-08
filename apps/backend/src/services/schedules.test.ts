import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';

const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch');
const { appRouter, schedules } = await import('@repo/trpc');
const { addPeriod, nextRunAfter, afterRun, isDue, outcomeOf, parseSegments, settleSession, tick } = schedules;

const silent = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {}, child: () => silent };

type User = { id: string; email: string; role: string };
type Data = { id: string; huntSessionId?: string; enabled?: boolean; [key: string]: unknown };

/** A gate reader that treats the listed teams as the caller's, with every plan allowed. */
function reader(teams: string[]) {
  const verdict = { allowed: true, enforced: true, upgradeUrl: 'https://sso.test/spaces' };
  return {
    team: async (_userId: string, teamId: string) => (teams.includes(teamId) ? verdict : null),
    personal: async () => verdict,
    entitledScopes: async () => ({ personal: true, teamIds: teams }),
  };
}

/** A queue that only records the jobs it was given. */
function fakeJobs() {
  const added: Array<{ queue: string; data: Record<string, unknown>; opts?: { delay?: number } }> = [];
  return {
    added,
    addJob: async (queue: string, _name: string, data: Record<string, unknown>, opts?: { delay?: number }) => {
      added.push({ queue, data, opts });
      return {};
    },
  };
}

/** Calls one procedure over HTTP with the real database, a fixed gate reader and a fake queue. */
async function call(
  prisma: PrismaClient,
  path: string,
  user: User,
  gate: ReturnType<typeof reader>,
  input: unknown,
  mutation = false
) {
  const req = mutation
    ? new Request(`http://g.test/trpc/${path}`, { method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' } })
    : new Request(`http://g.test/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`);
  const res = await fetchRequestHandler({
    endpoint: '/trpc',
    req,
    router: appRouter,
    createContext: () =>
      ({ user, actor: null, scopes: null, log: silent, forfait: gate, prisma, jobs: fakeJobs(), bulle: null, env: { OIDC_ISSUER: 'https://sso.test' } }) as never,
  });
  const body = (await res.json()) as { result?: { data?: Data }; error?: { data?: { plan_limit?: { key?: string; limit?: number } } } };
  return { status: res.status, data: body.result?.data as Data, error: body.error };
}

describe('cadence', () => {
  const at = (iso: string) => new Date(iso);

  test('a period is a day, a week, or a month clamped to the month end', () => {
    expect(addPeriod('DAILY', at('2026-11-08T09:00:00Z')).toISOString()).toBe('2026-11-09T09:00:00.000Z');
    expect(addPeriod('WEEKLY', at('2026-11-08T09:00:00Z')).toISOString()).toBe('2026-11-15T09:00:00.000Z');
    expect(addPeriod('MONTHLY', at('2026-01-31T09:00:00Z')).toISOString()).toBe('2026-02-28T09:00:00.000Z');
    expect(addPeriod('MONTHLY', at('2026-12-15T09:00:00Z')).toISOString()).toBe('2027-01-15T09:00:00.000Z');
  });

  test('the next run keeps the cadence and skips missed slots instead of replaying them', () => {
    const now = at('2026-11-08T12:00:00Z');
    expect(nextRunAfter('DAILY', at('2026-11-08T09:00:00Z'), now).toISOString()).toBe('2026-11-09T09:00:00.000Z');
    expect(nextRunAfter('DAILY', at('2026-11-01T09:00:00Z'), now).toISOString()).toBe('2026-11-09T09:00:00.000Z');
    expect(nextRunAfter('WEEKLY', at('2026-10-01T09:00:00Z'), now).toISOString()).toBe('2026-11-12T09:00:00.000Z');
    expect(nextRunAfter('DAILY', at('2026-11-08T12:00:00Z'), now) > now).toBe(true);
  });

  test('only an enabled schedule whose slot has come is due', () => {
    const now = at('2026-11-08T12:00:00Z');
    expect(isDue({ enabled: true, nextRunAt: at('2026-11-08T11:59:00Z') }, now)).toBe(true);
    expect(isDue({ enabled: true, nextRunAt: now }, now)).toBe(true);
    expect(isDue({ enabled: true, nextRunAt: at('2026-11-08T12:01:00Z') }, now)).toBe(false);
    expect(isDue({ enabled: false, nextRunAt: at('2026-11-01T00:00:00Z') }, now)).toBe(false);
  });

  test('the third failure in a row pauses, a success resets, a cancel changes nothing', () => {
    expect(afterRun(0, 'failure')).toEqual({ consecutiveFailures: 1, pause: false });
    expect(afterRun(2, 'failure')).toEqual({ consecutiveFailures: 3, pause: true });
    expect(afterRun(2, 'success')).toEqual({ consecutiveFailures: 0, pause: false });
    expect(afterRun(2, 'neutral')).toEqual({ consecutiveFailures: 2, pause: false });
    expect(outcomeOf('PROCESSING')).toBeNull();
    expect(outcomeOf('CANCELLED')).toBe('neutral');
  });

  test('segments keep known categories and fall back to the profile area', () => {
    const raw = '```json\n{"segments":[{"name":"Cafés du centre","categories":["cafe","spaceship"],"rationale":"Ils ont besoin d\'un site."},{"name":"Rien","categories":["spaceship"],"location":"Lyon"}]}\n```';
    expect(parseSegments(raw, 'Lyon')).toEqual([{ name: 'Cafés du centre', categories: ['cafe'], location: 'Lyon', rationale: "Ils ont besoin d'un site." }]);
    expect(parseSegments('no json', 'Lyon')).toEqual([]);
  });
});

describe.skipIf(!databaseUrl)('schedules on the database', () => {
  let prisma: PrismaClient;
  const tag = crypto.randomUUID();
  let alice: User;
  let bob: User;
  const ids: Record<string, string> = {};
  const filters = { location: 'Lyon, FR', categories: ['cafe'], radius: 5000, maxResults: 20 };
  const notices: Array<{ type: string; data: Record<string, unknown> }> = [];
  const hooks: Array<{ event: string; teamId: string }> = [];

  const runner = (jobs = fakeJobs(), allowed = async () => true, now = () => new Date()) => ({
    prisma,
    jobs: jobs as never,
    allowed,
    now,
    notify: async (_scope: unknown, type: string, data: Record<string, unknown>) => {
      notices.push({ type, data });
    },
    dispatch: async (options: { event: string; teamId: string }) => {
      hooks.push(options);
    },
  });

  const aliceGate = () => reader([ids.teamA!]);
  const bobGate = () => reader([ids.teamB!]);

  beforeAll(async () => {
    prisma = (await import('@repo/database')).prisma;
    const a = await prisma.user.create({ data: { email: `sa-${tag}@x.test`, firstName: 'A', lastName: 'A', password: 'x' } });
    const b = await prisma.user.create({ data: { email: `sb-${tag}@x.test`, firstName: 'B', lastName: 'B', password: 'x' } });
    alice = { id: a.id, email: a.email, role: 'USER' };
    bob = { id: b.id, email: b.email, role: 'USER' };
    ids.teamA = (await prisma.team.create({ data: { name: `sa-${tag}` } })).id;
    ids.teamB = (await prisma.team.create({ data: { name: `sb-${tag}` } })).id;
    await prisma.teamMember.createMany({
      data: [
        { teamId: ids.teamA, userId: a.id, role: 'OWNER' },
        { teamId: ids.teamB, userId: b.id, role: 'OWNER' },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.team.deleteMany({ where: { id: { in: [ids.teamA!, ids.teamB!] } } });
    await prisma.user.deleteMany({ where: { email: { in: [alice.email, bob.email] } } });
  }, 60_000);

  test('a member creates a schedule that runs at once as a hunt linked to it', async () => {
    const created = await call(prisma, 'huntSchedule.create', alice, aliceGate(), { teamId: ids.teamA, frequency: 'WEEKLY', runNow: true, ...filters }, true);
    expect(created.status).toBe(200);
    expect(created.data).toMatchObject({ teamId: ids.teamA, frequency: 'WEEKLY', enabled: true, name: 'Lyon, FR' });
    const session = await prisma.huntSession.findUniqueOrThrow({ where: { id: created.data.huntSessionId! } });
    expect(session).toMatchObject({ scheduleId: created.data.id, teamId: ids.teamA, huntType: 'LOCAL_BUSINESS' });
    const row = await prisma.huntSchedule.findUniqueOrThrow({ where: { id: created.data.id } });
    expect(row.lastSessionId).toBe(session.id);
    expect(row.nextRunAt.getTime() - row.lastRunAt!.getTime()).toBe(7 * 24 * 3600 * 1000);
    ids.weekly = created.data.id;
    ids.weeklyRun = session.id;
  });

  test('another team cannot read or change the schedule', async () => {
    const refused: Array<[string, unknown, boolean]> = [
      ['huntSchedule.pause', { scheduleId: ids.weekly }, true],
      ['huntSchedule.resume', { scheduleId: ids.weekly }, true],
      ['huntSchedule.runNow', { scheduleId: ids.weekly }, true],
      ['huntSchedule.update', { scheduleId: ids.weekly, frequency: 'DAILY' }, true],
      ['huntSchedule.delete', { scheduleId: ids.weekly }, true],
      ['huntSchedule.createFromSession', { huntSessionId: ids.weeklyRun, frequency: 'DAILY' }, true],
      ['huntSchedule.list', { teamId: ids.teamA }, false],
      ['prospect.get', { teamId: ids.teamA }, false],
      ['prospect.save', { teamId: ids.teamA, area: 'Hacked' }, true],
    ];
    for (const [path, input, mutation] of refused) {
      const res = await call(prisma, path, bob, bobGate(), input, mutation);
      expect({ path, refused: res.status === 403 || res.status === 404 }).toEqual({ path, refused: true });
    }
    const forged = reader([ids.teamA!, ids.teamB!]);
    expect((await call(prisma, 'huntSchedule.pause', bob, forged, { scheduleId: ids.weekly }, true)).status).toBe(403);
    expect((await call(prisma, 'huntSchedule.list', bob, forged, { teamId: ids.teamA })).status).toBe(403);
    const bobList = await call(prisma, 'huntSchedule.list', bob, bobGate(), { teamId: ids.teamB });
    expect(bobList.data).toEqual([] as never);
    const row = await prisma.huntSchedule.findUniqueOrThrow({ where: { id: ids.weekly } });
    expect(row).toMatchObject({ enabled: true, frequency: 'WEEKLY' });
  });

  test('run now is refused while the previous run is still going, and two claims on one slot start once', async () => {
    const busy = await call(prisma, 'huntSchedule.runNow', alice, aliceGate(), { scheduleId: ids.weekly }, true);
    expect(busy.status).toBe(409);
    await prisma.huntSession.update({ where: { id: ids.weeklyRun }, data: { status: 'COMPLETED', successfulLeads: 0 } });
    const stale = await prisma.huntSchedule.findUniqueOrThrow({ where: { id: ids.weekly } });
    const deps = { prisma, jobs: fakeJobs() as never };
    const [one, two] = await Promise.all([schedules.startRun(deps, stale, new Date()), schedules.startRun(deps, stale, new Date())]);
    expect([one, two].filter(Boolean)).toHaveLength(1);
    const sessions = await prisma.huntSession.count({ where: { scheduleId: ids.weekly } });
    expect(sessions).toBe(2);
  });

  test('a tick starts due schedules only, skips a busy one, and paces the runs', async () => {
    const past = new Date(Date.now() - 60_000);
    const base = { userId: alice.id, teamId: ids.teamA!, filters, frequency: 'DAILY' as const };
    const due = await prisma.huntSchedule.create({ data: { ...base, name: `due-${tag}`, nextRunAt: past } });
    const due2 = await prisma.huntSchedule.create({ data: { ...base, name: `due2-${tag}`, nextRunAt: past } });
    const later = await prisma.huntSchedule.create({ data: { ...base, name: `later-${tag}`, nextRunAt: new Date(Date.now() + 3600_000) } });
    const paused = await prisma.huntSchedule.create({ data: { ...base, name: `paused-${tag}`, enabled: false, nextRunAt: past } });
    const jobs = fakeJobs();
    await tick(runner(jobs));
    const rows = await prisma.huntSchedule.findMany({ where: { id: { in: [due.id, due2.id, later.id, paused.id] } } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(due.id)!.lastSessionId).not.toBeNull();
    expect(byId.get(due2.id)!.lastSessionId).not.toBeNull();
    expect(byId.get(later.id)!.lastSessionId).toBeNull();
    expect(byId.get(paused.id)!.lastSessionId).toBeNull();
    expect(byId.get(due.id)!.nextRunAt.toISOString()).toBe(nextRunAfter('DAILY', past, byId.get(due.id)!.lastRunAt!).toISOString());
    const delays = jobs.added.filter((job) => [byId.get(due.id)!.lastSessionId, byId.get(due2.id)!.lastSessionId].includes(job.data.huntSessionId as string)).map((job) => job.opts?.delay ?? 0);
    expect(new Set(delays).size).toBe(2);
    await prisma.huntSchedule.update({ where: { id: due.id }, data: { nextRunAt: past } });
    const result2 = await tick(runner(fakeJobs()));
    expect(result2.busy).toBeGreaterThanOrEqual(1);
    const stillOne = await prisma.huntSession.count({ where: { scheduleId: due.id } });
    expect(stillOne).toBe(1);
    await prisma.huntSchedule.deleteMany({ where: { id: { in: [due.id, due2.id, later.id, paused.id] } } });
  });

  test('a scope without a plan has its slot skipped without a run or a failure', async () => {
    const past = new Date(Date.now() - 60_000);
    const row = await prisma.huntSchedule.create({ data: { userId: alice.id, teamId: ids.teamA!, filters, frequency: 'DAILY', name: `noplan-${tag}`, nextRunAt: past } });
    await tick(runner(fakeJobs(), async () => false));
    const after = await prisma.huntSchedule.findUniqueOrThrow({ where: { id: row.id } });
    expect(after).toMatchObject({ lastSessionId: null, consecutiveFailures: 0, enabled: true });
    expect(after.nextRunAt > new Date()).toBe(true);
    await prisma.huntSchedule.delete({ where: { id: row.id } });
  });

  test('three failed runs in a row pause the schedule with a notice; a success sends the digest', async () => {
    const row = await prisma.huntSchedule.create({ data: { userId: alice.id, teamId: ids.teamA!, filters, frequency: 'DAILY', name: `fail-${tag}`, nextRunAt: new Date() } });
    const deps = runner();
    const run = async (status: 'FAILED' | 'COMPLETED', leads = 0) => {
      const session = await prisma.huntSession.create({ data: { userId: alice.id, teamId: ids.teamA!, huntType: 'LOCAL_BUSINESS', scheduleId: row.id, status, successfulLeads: leads } });
      await prisma.huntSchedule.update({ where: { id: row.id }, data: { lastSessionId: session.id } });
      return settleSession(deps, session.id);
    };
    notices.length = 0;
    hooks.length = 0;
    expect(await run('COMPLETED', 4)).toBe(true);
    expect(notices).toEqual([{ type: 'hunt-digest', data: expect.objectContaining({ newLeads: 4, scheduleId: row.id }) }]);
    expect(hooks).toEqual([expect.objectContaining({ event: 'hunt.digest', teamId: ids.teamA })]);
    notices.length = 0;
    expect(await run('COMPLETED', 0)).toBe(true);
    expect(notices).toEqual([]);
    await run('FAILED');
    await run('FAILED');
    let current = await prisma.huntSchedule.findUniqueOrThrow({ where: { id: row.id } });
    expect(current).toMatchObject({ enabled: true, consecutiveFailures: 2 });
    const third = await run('FAILED');
    expect(third).toBe(true);
    expect(await settleSession(deps, current.lastSessionId!)).toBe(false);
    current = await prisma.huntSchedule.findUniqueOrThrow({ where: { id: row.id } });
    expect(current).toMatchObject({ enabled: false, consecutiveFailures: 3, pausedReason: 'failures' });
    expect(notices.map((n) => n.type)).toEqual(['hunt-schedule-paused']);
    const again = await settleSession(deps, current.lastSessionId!);
    expect(again).toBe(false);
    ids.failing = row.id;
  });

  test('resume clears the failures; the plan caps active schedules', async () => {
    const active = await prisma.huntSchedule.count({ where: { teamId: ids.teamA, enabled: true } });
    expect(active).toBe(1);
    await prisma.forfaitState.create({ data: { id: 1, issuer: 'https://sso.test', version: 1n, revision: 1n, firstAppliedAt: new Date(), lastAppliedAt: new Date() } });
    await prisma.team.update({ where: { id: ids.teamA }, data: { entitlements: { 'glouton.access': true, 'glouton.hunt_schedules': 1 } } });
    try {
      const refused = await call(prisma, 'huntSchedule.resume', alice, aliceGate(), { scheduleId: ids.failing }, true);
      expect(refused.status).toBe(402);
      expect(refused.error?.data?.plan_limit).toMatchObject({ key: 'glouton.hunt_schedules', limit: 1 });
      const create = await call(prisma, 'huntSchedule.create', alice, aliceGate(), { teamId: ids.teamA, frequency: 'DAILY', ...filters }, true);
      expect(create.status).toBe(402);
      expect((await call(prisma, 'huntSchedule.pause', alice, aliceGate(), { scheduleId: ids.weekly }, true)).status).toBe(200);
      const resumed = await call(prisma, 'huntSchedule.resume', alice, aliceGate(), { scheduleId: ids.failing }, true);
      expect(resumed.status).toBe(200);
      expect(resumed.data).toMatchObject({ enabled: true, consecutiveFailures: 0, pausedReason: null });
    } finally {
      await prisma.forfaitState.deleteMany({});
    }
    expect((await call(prisma, 'huntSchedule.resume', alice, aliceGate(), { scheduleId: ids.weekly }, true)).status).toBe(200);
  });

  test('the profile is per space and creates one schedule per missing category', async () => {
    const saved = await call(prisma, 'prospect.save', alice, aliceGate(), {
      teamId: ids.teamA,
      offerDescription: 'Sites web pour commerces',
      area: 'Lyon, FR',
      targetCategories: ['cafe', 'bar', 'cafe'],
      nafCodes: ['56.10a'],
      keywords: ['Site', 'site'],
    }, true);
    expect(saved.status).toBe(200);
    expect(saved.data).toMatchObject({ targetCategories: ['cafe', 'bar'], nafCodes: ['56.10A'], keywords: ['site'] });
    const personal = await call(prisma, 'prospect.get', alice, aliceGate(), {});
    expect(personal.data).toMatchObject({ area: null, targetCategories: [] });
    expect((await call(prisma, 'prospect.save', alice, aliceGate(), { nafCodes: ['nope'] }, true)).status).toBe(400);
    const made = await call(prisma, 'huntSchedule.createFromProfile', alice, aliceGate(), { teamId: ids.teamA, frequency: 'WEEKLY' }, true);
    expect(made.data).toMatchObject({ created: 1, skipped: 1 });
    const twice = await call(prisma, 'huntSchedule.createFromProfile', alice, aliceGate(), { teamId: ids.teamA, frequency: 'WEEKLY' }, true);
    expect(twice.data).toMatchObject({ created: 0, skipped: 2 });
  });

  test('a finished hunt repeats from its detail with the same filters', async () => {
    const res = await call(prisma, 'huntSchedule.createFromSession', alice, aliceGate(), { huntSessionId: ids.weeklyRun, frequency: 'MONTHLY' }, true);
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ teamId: ids.teamA, frequency: 'MONTHLY', filters: { location: 'Lyon, FR', categories: ['cafe'] } });
    const list = await call(prisma, 'huntSchedule.list', alice, aliceGate(), { teamId: ids.teamA });
    expect((list.data as unknown as Data[]).some((row) => row.id === res.data.id)).toBe(true);
    expect((await call(prisma, 'huntSchedule.delete', alice, aliceGate(), { scheduleId: res.data.id }, true)).status).toBe(200);
    expect(await prisma.huntSchedule.findUnique({ where: { id: res.data.id } })).toBeNull();
  });
});
