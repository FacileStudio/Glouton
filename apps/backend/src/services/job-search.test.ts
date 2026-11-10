import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { deflateRawSync } from 'node:zlib';
import type { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';

const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch');
const { appRouter, BulleClient, jobSearch, competitorAi } = await import('@repo/trpc');
const { matchOffer, contractsOf, webPosting, canMove, transition, parseJobDraft, docxText, sniffType, rank } = jobSearch;
const { AiOutputError } = competitorAi;

const silent = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {}, child: () => silent };
const UPGRADE = 'https://sso.test/spaces/space-a';

type User = { id: string; email: string; role: string };
type Body = { result?: { data?: unknown }; error?: { message?: string; data?: Record<string, unknown> } };

const lyonRemote = { role: 'chargé de communication', skills: ['réseaux sociaux'], location: 'Lyon', remote: true, contracts: [], salaryMin: null };

function posting(over: Partial<Parameters<typeof matchOffer>[0]> = {}): Parameters<typeof matchOffer>[0] {
  return {
    source: 'remotive',
    url: 'https://jobs.test/1',
    title: 'Chargée de communication H/F',
    company: 'Acme',
    location: 'Lyon, France',
    remote: false,
    contractText: 'CDI',
    salaryMin: null,
    salaryMax: null,
    currency: null,
    salaryText: null,
    description: 'Vous animez nos réseaux sociaux et rédigez nos newsletters.',
    skills: [],
    postedAt: null,
    ...over,
  };
}

/** A minimal DOCX: a zip holding word/document.xml, deflated like Word does. */
function docx(paragraphs: string[]): Buffer {
  const xml = `<?xml version="1.0"?><w:document><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`;
  const name = Buffer.from('word/document.xml');
  const raw = Buffer.from(xml);
  const data = deflateRawSync(raw);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}

describe('job search filters', () => {
  test('the role matches across gendered and plural forms, in the title', () => {
    expect(matchOffer(posting(), lyonRemote)).toMatchObject({ keep: true, contract: 'permanent' });
    expect(matchOffer(posting({ title: 'Chargés de communications' }), lyonRemote).keep).toBe(true);
    expect(matchOffer(posting({ title: 'Comptable' }), lyonRemote).keep).toBe(false);
    expect(matchOffer(posting({ title: 'Senior Backend Engineer', description: 'Go, Postgres' }), lyonRemote).keep).toBe(false);
  });

  test('a location keeps that place, plus remote postings when remote is on', () => {
    expect(matchOffer(posting({ location: 'Paris' }), lyonRemote).keep).toBe(false);
    expect(matchOffer(posting({ location: 'Paris', remote: true }), lyonRemote).keep).toBe(true);
    expect(matchOffer(posting({ location: 'Paris', remote: true }), { ...lyonRemote, remote: false }).keep).toBe(false);
    expect(matchOffer(posting({ location: 'Paris' }), { ...lyonRemote, location: null }).keep).toBe(false);
    expect(matchOffer(posting({ location: 'Paris' }), { ...lyonRemote, location: null, remote: false }).keep).toBe(true);
  });

  test('contracts and the salary floor drop only postings that state otherwise', () => {
    expect(contractsOf('Stage de 6 mois')).toEqual(['internship']);
    expect(contractsOf('Contrat / Freelance')).toEqual(['freelance']);
    expect(contractsOf('Full-Time')).toEqual(['permanent']);
    expect(matchOffer(posting({ contractText: 'Stage' }), { ...lyonRemote, contracts: ['permanent'] }).keep).toBe(false);
    expect(matchOffer(posting({ contractText: null }), { ...lyonRemote, contracts: ['permanent'] }).keep).toBe(true);
    expect(matchOffer(posting({ salaryMax: 28_000 }), { ...lyonRemote, salaryMin: 32_000 }).keep).toBe(false);
    expect(matchOffer(posting({ salaryMax: 38_000 }), { ...lyonRemote, salaryMin: 32_000 }).keep).toBe(true);
    expect(matchOffer(posting({ salaryMax: null }), { ...lyonRemote, salaryMin: 32_000 }).keep).toBe(true);
  });

  test('with no role, one skill must appear; the score ranks a full title match first', () => {
    expect(matchOffer(posting({ title: 'Community manager' }), { ...lyonRemote, role: '' }).keep).toBe(true);
    expect(matchOffer(posting({ title: 'Community manager', description: 'Print' }), { ...lyonRemote, role: '' }).keep).toBe(false);
    const ranked = rank([posting({ url: 'https://a.test/x', title: 'Chargé de projet', description: 'Communication interne et réseaux sociaux' }), posting({ url: 'https://a.test/y' })], lyonRemote);
    expect(ranked.map((entry) => entry.url)).toEqual(['https://a.test/y', 'https://a.test/x']);
  });

  test('web results become postings without tracking, homepages and search pages are skipped', () => {
    expect(webPosting({ title: 'Chargé de communication - Acme | Careers', snippet: 'Lyon, CDI, télétravail partiel', url: 'https://acme.test/careers/123?utm_source=x#top' })).toMatchObject({
      url: 'https://acme.test/careers/123',
      title: 'Chargé de communication - Acme',
      company: 'acme',
      remote: true,
    });
    expect(webPosting({ title: 'Acme', snippet: '', url: 'https://acme.test/' })).toBeNull();
    expect(webPosting({ title: 'Emplois', snippet: '', url: 'https://www.indeed.fr/jobs' })).toBeNull();
    expect(webPosting({ title: 'Chargé de com', snippet: 'Lyon', url: 'https://fr.indeed.com/viewjob?jk=1' })?.company).toBeNull();
  });
});

describe('application state machine', () => {
  const now = new Date('2026-11-10T10:00:00Z');
  const fresh = { status: 'TO_APPLY' as const, appliedAt: null, interviewAt: null, offerAt: null, rejectedAt: null };

  test('forward moves stamp their date once; a typed interview date stays', () => {
    expect(transition(fresh, 'APPLIED', now)).toEqual({ status: 'APPLIED', appliedAt: now });
    const planned = new Date('2026-11-20T09:00:00Z');
    expect(transition({ ...fresh, status: 'APPLIED', appliedAt: now, interviewAt: planned }, 'INTERVIEW', now)).toEqual({ status: 'INTERVIEW' });
  });

  test('going back clears the undone steps; reopening clears the rejection', () => {
    expect(transition({ ...fresh, status: 'INTERVIEW', appliedAt: now, interviewAt: now }, 'APPLIED', now)).toMatchObject({ status: 'APPLIED', interviewAt: null, offerAt: null });
    expect(transition({ ...fresh, status: 'REJECTED', appliedAt: now, rejectedAt: now }, 'APPLIED', now)).toEqual({ status: 'APPLIED', rejectedAt: null });
  });

  test('skipping the pipeline is refused', () => {
    expect(canMove('TO_APPLY', 'INTERVIEW')).toBe(false);
    expect(canMove('TO_APPLY', 'OFFER')).toBe(false);
    expect(canMove('OFFER', 'TO_APPLY')).toBe(false);
    expect(canMove('APPLIED', 'OFFER')).toBe(true);
    expect(() => transition(fresh, 'OFFER', now)).toThrow();
  });
});

describe('CV files and tailoring output', () => {
  test('a DOCX gives its paragraphs; only PDF and DOCX bytes are accepted', () => {
    const file = docx(['Camille Martin', 'Chargée de communication &amp; événementiel']);
    expect(sniffType(file)).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(docxText(file)).toBe('Camille Martin\nChargée de communication & événementiel');
    expect(sniffType(Buffer.from('%PDF-1.7\n...'))).toBe('application/pdf');
    expect(sniffType(Buffer.from('MZ\x90\x00 not a cv'))).toBeNull();
    expect(docxText(Buffer.from('PK\x03\x04 broken'))).toBe('');
  });

  test('a draft is exactly the asked JSON, fenced or not; anything else is refused whole', () => {
    expect(parseJobDraft('LETTER', '{"letter":"Madame, Monsieur,"}')).toBe('Madame, Monsieur,');
    expect(parseJobDraft('CV', '```json\n{"cv":"# Camille"}\n```')).toBe('# Camille');
    for (const [kind, raw] of [
      ['LETTER', 'Dear hiring manager'],
      ['LETTER', '{"letter":""}'],
      ['LETTER', '{"letter":"Hi","send":true}'],
      ['LETTER', '{"cv":"# Camille"}'],
      ['CV', '{"cv":["a"]}'],
    ] as const) {
      expect(() => parseJobDraft(kind, raw)).toThrow(AiOutputError);
    }
  });
});

function fakeBulle() {
  const state = { answers: [] as Array<string | { status: number; body: unknown }>, prompts: [] as Array<{ system: string; user: string }> };
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path === '/api/llm') return Response.json({ backend: 'anthropic', model: 'm-1', models: ['m-1'], persona: '' });
    const body = JSON.parse(String(init?.body)) as { system: string; messages: Array<{ content: string }> };
    state.prompts.push({ system: body.system, user: body.messages[0]!.content });
    const next = state.answers.shift() ?? '{"letter":"Madame, Monsieur, je souhaite rejoindre Acme."}';
    if (typeof next !== 'string') return Response.json(next.body, { status: next.status });
    return Response.json({ content: [{ type: 'text', text: next }] });
  };
  const tokens = { token: async () => 'token', forget: () => {} };
  return { bulle: new BulleClient({ bulleUrl: 'https://bulle.test', tokens: tokens as never, fetch: fetchImpl as typeof fetch }), state };
}

function reader(ai: Record<string, boolean>) {
  return {
    team: async (_userId: string, teamId: string) => (teamId in ai ? { allowed: true, enforced: true, upgradeUrl: UPGRADE, aiAccess: ai[teamId] } : null),
    personal: async () => ({ allowed: true, enforced: true, upgradeUrl: UPGRADE, aiAccess: false }),
    entitledScopes: async () => ({ personal: true, teamIds: Object.keys(ai) }),
  };
}

describe.skipIf(!databaseUrl)('job search through tRPC', () => {
  let prisma: PrismaClient;
  const tag = crypto.randomUUID().slice(0, 8);
  const users: Record<string, User> = {};
  const ids: Record<string, string> = {};
  const queued: unknown[] = [];

  async function call<T = unknown>(path: string, user: User, input: unknown, opts: { bulle?: unknown; ai?: Record<string, boolean> } = {}, mutation = true) {
    const req = mutation
      ? new Request(`http://g.test/trpc/${path}`, { method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' } })
      : new Request(`http://g.test/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`);
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req,
      router: appRouter,
      createContext: () =>
        ({
          user,
          actor: null,
          scopes: null,
          log: silent,
          prisma,
          forfait: reader(opts.ai ?? { [ids.teamA!]: true, [ids.teamB!]: false }),
          bulle: opts.bulle ?? null,
          web: null,
          jobs: { addJob: async (...args: unknown[]) => void queued.push(args) },
          planMode: 'paid',
          env: { OIDC_ISSUER: 'https://sso.test' },
        }) as never,
    });
    const body = (await res.json()) as Body;
    return { status: res.status, data: body.result?.data as T, error: body.error };
  }

  beforeAll(async () => {
    prisma = (await import('@repo/database')).prisma;
    for (const name of ['alice', 'carol', 'bob']) {
      const row = await prisma.user.create({ data: { email: `job-${name}-${tag}@x.test`, firstName: name, lastName: 'T', password: 'x' } });
      users[name] = { id: row.id, email: row.email, role: 'USER' };
    }
    ids.teamA = (await prisma.team.create({ data: { name: `job-a-${tag}` } })).id;
    ids.teamB = (await prisma.team.create({ data: { name: `job-b-${tag}` } })).id;
    await prisma.teamMember.createMany({
      data: [
        { teamId: ids.teamA, userId: users.alice!.id, role: 'OWNER' },
        { teamId: ids.teamA, userId: users.carol!.id, role: 'MEMBER' },
        { teamId: ids.teamB, userId: users.bob!.id, role: 'OWNER' },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.team.deleteMany({ where: { id: { in: [ids.teamA!, ids.teamB!] } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } });
  }, 60_000);

  test('a run keeps the filtered offers of boards and web, once each; another team sees none', async () => {
    const created = await call<{ id: string }>('job.createSearch', users.alice!, { teamId: ids.teamA, search: lyonRemote, runNow: true });
    expect(created.status).toBe(200);
    ids.search = created.data.id;
    expect(queued).toHaveLength(1);
    const boardPostings = [
      { title: 'Chargée de communication', description: 'Réseaux sociaux, presse', company: 'Acme', sourceUrl: 'https://acme.test/jobs/1', tags: [], location: 'Lyon', isRemote: false, postedAt: new Date(), contractType: 'CDI' },
      { title: 'Chargé de communication', description: 'Full remote', company: 'Remote Co', sourceUrl: 'https://remote.test/2', tags: [], location: 'Europe', isRemote: true, postedAt: new Date() },
      { title: 'Backend engineer', description: 'Go', company: 'Tech', sourceUrl: 'https://tech.test/3', tags: [], location: 'Lyon', isRemote: false, postedAt: new Date() },
    ];
    const boards = [
      { name: 'remotive', search: async () => boardPostings },
      { name: 'broken', search: async () => { throw new Error('down'); } },
    ];
    const searched: string[] = [];
    const web = {
      search: async (key: string, query: string) => {
        searched.push(`${key}|${query}`);
        return [{ title: 'Chargé de communication H/F - Lyon', snippet: 'Lyon, CDI', url: 'https://acme.test/jobs/1?utm_source=sonar', engine: 'x' }];
      },
    };
    const deps = { prisma, boards, web };
    const job = { userId: users.alice!.id, teamId: ids.teamA!, searchId: ids.search!, trigger: 'manual' as const };
    const first = await jobSearch.runSearch(deps, job);
    expect(first).toMatchObject({ status: 'done', created: 2, errors: ['broken:failed'] });
    expect(searched[0]).toStartWith(`${ids.teamA}|`);
    expect((await jobSearch.runSearch(deps, job)).created).toBe(0);

    const offers = await call<Array<{ id: string; url: string; contract: string | null }>>('job.offers', users.carol!, { teamId: ids.teamA }, {}, false);
    expect(offers.data.map((offer) => offer.url).sort()).toEqual(['https://acme.test/jobs/1', 'https://remote.test/2']);
    ids.offer = offers.data.find((offer) => offer.url === 'https://acme.test/jobs/1')!.id;
    ids.remoteOffer = offers.data.find((offer) => offer.url === 'https://remote.test/2')!.id;

    expect((await call('job.offers', users.bob!, { teamId: ids.teamA }, {}, false)).status).toBe(403);
    expect((await call<unknown[]>('job.offers', users.bob!, { teamId: ids.teamB }, {}, false)).data).toEqual([]);
    expect((await call('job.dismissOffer', users.bob!, { teamId: ids.teamB, offerId: ids.offer })).status).toBe(404);
    expect((await call('job.runSearch', users.bob!, { teamId: ids.teamB, searchId: ids.search })).status).toBe(404);

    expect((await call('job.dismissOffer', users.alice!, { teamId: ids.teamA, offerId: ids.remoteOffer })).status).toBe(200);
    await prisma.jobOffer.deleteMany({ where: { id: ids.offer } });
    expect((await jobSearch.runSearch(deps, job)).created).toBe(1);
    ids.offer = (await prisma.jobOffer.findFirstOrThrow({ where: { url: 'https://acme.test/jobs/1', teamId: ids.teamA } })).id;
  });

  test('a recurring search is queued once per slot by the tick', async () => {
    const past = new Date(Date.now() - 60_000);
    await prisma.jobSearch.update({ where: { id: ids.search }, data: { frequency: 'WEEKLY', nextRunAt: past, status: null } });
    const added: unknown[] = [];
    const tickDeps = { prisma, jobs: { addJob: async (...args: unknown[]) => void added.push(args) }, allowed: async () => true };
    const [a, b] = await Promise.all([jobSearch.tick(tickDeps as never), jobSearch.tick(tickDeps as never)]);
    expect(a.queued + b.queued).toBe(1);
    const row = await prisma.jobSearch.findUniqueOrThrow({ where: { id: ids.search } });
    expect(row.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    await prisma.jobSearch.update({ where: { id: ids.search }, data: { frequency: null, status: null } });
  });

  test('a saved offer becomes an application that moves through the pipeline, inside its team only', async () => {
    const saved = await call<{ applicationId: string }>('job.saveOffer', users.alice!, { teamId: ids.teamA, offerId: ids.offer });
    expect(saved.status).toBe(200);
    ids.app = saved.data.applicationId;
    expect((await call('job.saveOffer', users.alice!, { teamId: ids.teamA, offerId: ids.offer })).status).toBe(409);
    const skip = await call('job.moveApplication', users.alice!, { teamId: ids.teamA, applicationId: ids.app, status: 'INTERVIEW' });
    expect(skip.status).toBe(400);
    const applied = await call<{ status: string; appliedAt: string }>('job.moveApplication', users.carol!, { teamId: ids.teamA, applicationId: ids.app, status: 'APPLIED' });
    expect(applied.data).toMatchObject({ status: 'APPLIED' });
    expect(applied.data.appliedAt).toBeTruthy();
    const interview = await call<{ status: string }>('job.moveApplication', users.alice!, { teamId: ids.teamA, applicationId: ids.app, status: 'INTERVIEW' });
    expect(interview.data.status).toBe('INTERVIEW');
    const remindAt = new Date(Date.now() - 1000).toISOString();
    const updated = await call<{ contactName: string }>('job.updateApplication', users.alice!, {
      teamId: ids.teamA,
      applicationId: ids.app,
      application: { notes: 'Entretien avec la DRH', contactName: 'Nadia', contactEmail: 'nadia@acme.test', remindAt },
    });
    expect(updated.data.contactName).toBe('Nadia');
    const reminders = await jobSearch.claimReminders(prisma);
    expect(reminders.filter((entry) => entry.applicationId === ids.app)).toHaveLength(1);
    expect((await jobSearch.claimReminders(prisma)).filter((entry) => entry.applicationId === ids.app)).toHaveLength(0);
    for (const [path, input] of [
      ['job.application', { teamId: ids.teamB, applicationId: ids.app }],
      ['job.moveApplication', { teamId: ids.teamB, applicationId: ids.app, status: 'OFFER' }],
      ['job.deleteApplication', { teamId: ids.teamB, applicationId: ids.app }],
    ] as const) {
      expect((await call(path, users.bob!, input, {}, path !== 'job.application')).status).toBe(404);
    }
    expect((await prisma.jobApplication.findUniqueOrThrow({ where: { id: ids.app } })).status).toBe('INTERVIEW');
  });

  test('a CV is private to its owner until shared, and then read-only for teammates', async () => {
    const created = await call<{ id: string; hasText: boolean }>('job.createCv', users.alice!, {
      teamId: ids.teamA,
      name: 'CV Alice',
      fileName: 'cv.docx',
      data: docx(['Alice T', 'Chargée de communication, 5 ans', 'Réseaux sociaux, relations presse']).toString('base64'),
    });
    expect(created.status).toBe(200);
    expect(created.data.hasText).toBe(true);
    ids.cv = created.data.id;
    expect((await call('job.createCv', users.alice!, { teamId: ids.teamA, name: 'x', data: Buffer.from('MZ not a cv').toString('base64') })).error?.message).toBe('cv_type');

    expect((await call<unknown[]>('job.cvs', users.carol!, { teamId: ids.teamA }, {}, false)).data).toEqual([]);
    for (const path of ['job.cv', 'job.downloadCv']) {
      expect((await call(path, users.carol!, { teamId: ids.teamA, cvId: ids.cv }, {}, false)).status).toBe(404);
      expect((await call(path, users.bob!, { teamId: ids.teamB, cvId: ids.cv }, {}, false)).status).toBe(404);
      expect((await call(path, users.bob!, { teamId: ids.teamA, cvId: ids.cv }, {}, false)).status).toBe(403);
    }
    expect((await call('job.deleteCv', users.carol!, { teamId: ids.teamA, cvId: ids.cv })).status).toBe(404);

    expect((await call('job.updateCv', users.alice!, { teamId: ids.teamA, cvId: ids.cv, shared: true })).status).toBe(200);
    const shared = await call<Array<{ id: string; mine: boolean }>>('job.cvs', users.carol!, { teamId: ids.teamA }, {}, false);
    expect(shared.data).toEqual([expect.objectContaining({ id: ids.cv, mine: false })]);
    expect((await call<{ text: string }>('job.cv', users.carol!, { teamId: ids.teamA, cvId: ids.cv }, {}, false)).data.text).toContain('Chargée de communication');
    expect((await call('job.updateCv', users.carol!, { teamId: ids.teamA, cvId: ids.cv, text: 'hacked' })).status).toBe(403);
    expect((await call('job.deleteCv', users.carol!, { teamId: ids.teamA, cvId: ids.cv })).status).toBe(403);
    expect((await call('job.cv', users.bob!, { teamId: ids.teamB, cvId: ids.cv }, {}, false)).status).toBe(404);

    await prisma.teamMember.deleteMany({ where: { teamId: ids.teamA, userId: users.alice!.id } });
    expect((await call<unknown[]>('job.cvs', users.carol!, { teamId: ids.teamA }, {}, false)).data).toEqual([]);
    await prisma.teamMember.create({ data: { teamId: ids.teamA, userId: users.alice!.id, role: 'OWNER' } });
    expect((await call('job.updateCv', users.alice!, { teamId: ids.teamA, cvId: ids.cv, shared: false })).status).toBe(200);
  });

  test('Bulle tailors a private, editable cover letter draft; output is validated and a 402 shows the upsell', async () => {
    const { bulle, state } = fakeBulle();
    const res = await call<{ id: string; content: string; kind: string }>('job.draft', users.alice!, { teamId: ids.teamA, applicationId: ids.app, kind: 'LETTER', language: 'fr' }, { bulle });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ kind: 'LETTER', content: 'Madame, Monsieur, je souhaite rejoindre Acme.' });
    expect(state.prompts[0]!.system).toContain(jobSearch.JOB_UNTRUSTED_RULE);
    expect(state.prompts[0]!.system).toContain('Write every text value in French.');
    expect(state.prompts[0]!.user).toContain('Chargée de communication, 5 ans');
    ids.draft = res.data.id;

    expect((await call<unknown[]>('job.drafts', users.carol!, { teamId: ids.teamA, applicationId: ids.app }, {}, false)).data).toEqual([]);
    expect((await call('job.updateDraft', users.carol!, { teamId: ids.teamA, draftId: ids.draft, content: 'x' })).status).toBe(404);
    const edited = await call<{ content: string }>('job.updateDraft', users.alice!, { teamId: ids.teamA, draftId: ids.draft, content: 'Madame, je postule.' });
    expect(edited.data.content).toBe('Madame, je postule.');

    state.answers.push('{"letter":"Hi","send":true}');
    expect((await call('job.draft', users.alice!, { teamId: ids.teamA, applicationId: ids.app, kind: 'LETTER' }, { bulle })).status).toBe(422);
    expect((await prisma.jobDraft.findUniqueOrThrow({ where: { id: ids.draft } })).content).toBe('Madame, je postule.');

    state.answers.push({ status: 402, body: { error: { message: 'AI needs Pro', upgrade_url: UPGRADE, key: 'ai.access' } } });
    const refused = await call('job.draft', users.alice!, { teamId: ids.teamA, applicationId: ids.app, kind: 'CV' }, { bulle });
    expect(refused.error?.data?.plan_limit).toEqual(expect.objectContaining({ upgrade_url: UPGRADE, message: 'AI needs Pro' }));

    const before = state.prompts.length;
    const noAi = await call('job.draft', users.alice!, { teamId: ids.teamA, applicationId: ids.app, kind: 'CV' }, { bulle, ai: { [ids.teamA!]: false } });
    expect(noAi.error?.data?.plan_limit).toEqual(expect.objectContaining({ upgrade_url: UPGRADE }));
    expect(state.prompts.length).toBe(before);

    const carolTry = await call('job.draft', users.carol!, { teamId: ids.teamA, applicationId: ids.app, kind: 'LETTER' }, { bulle });
    expect(carolTry.error?.message).toBe('cv_text_missing');
  });

  test('deleting a CV removes it for good', async () => {
    expect((await call('job.deleteCv', users.alice!, { teamId: ids.teamA, cvId: ids.cv })).status).toBe(200);
    expect(await prisma.jobCv.findUnique({ where: { id: ids.cv } })).toBeNull();
    expect((await prisma.jobDraft.findUniqueOrThrow({ where: { id: ids.draft } })).cvId).toBeNull();
  });

  test('a profile keeps a job block and must save at least one usage', async () => {
    const saved = await call<{ usages: string[]; targets: { job: Record<string, unknown> } }>('prospect.save', users.carol!, {
      usages: ['job'],
      targets: { job: { role: 'Chargé de communication', location: 'Lyon', remote: true, contracts: ['permanent', 'permanent'], keywords: ['Canva'] } },
    });
    expect(saved.data.usages).toEqual(['job']);
    expect(saved.data.targets.job).toMatchObject({ role: 'Chargé de communication', location: 'Lyon', remote: true, contracts: ['permanent'], keywords: ['canva'], salaryMin: null });
    const bare = await call('prospect.save', users.bob!, { offerDescription: 'x' });
    expect(bare.status).toBe(400);
  });
});
