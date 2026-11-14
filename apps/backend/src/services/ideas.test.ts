import { describe, expect, test } from 'bun:test';
import type { ideas } from '@repo/trpc';

process.env.DATABASE_URL ??= 'postgresql://unused@localhost/unused';

const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch');
const { appRouter, createBulle } = await import('@repo/trpc');

type IdeasPageView = ReturnType<typeof ideas.pageView>;
type RunView = ReturnType<typeof ideas.runView>;

const silent = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {}, child: () => silent };
const UPGRADE = 'https://sso.test/spaces/space-a';
const TEAM = '6f1c0c1e-6a43-4d3e-9a51-0d6b2f3c4a10';
const OTHER_TEAM = '0b9d2a55-2a7e-4b0c-8f0f-3d1e5c6b7a80';
const user = { id: 'user-1', email: 'a@x.test', role: 'USER' };

type Body = { result?: { data?: unknown }; error?: { data?: Record<string, unknown>; message?: string } };
type Seen = { method: string; path: string; search: URLSearchParams; auth: string | null; body: unknown };

/** Bulle at the HTTP level, behind the real tronc client; `answers` overrides one route. */
function fakeBulle(answers: Record<string, { status: number; body: unknown }> = {}) {
  const seen: Seen[] = [];
  const targets: unknown[] = [];
  const fetchImpl = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    seen.push({ method, path: url.pathname, search: url.searchParams, auth: headers.get('authorization'), body: init.body ? JSON.parse(String(init.body)) : undefined });
    const override = answers[`${method} ${url.pathname}`];
    if (override) return Response.json(override.body, { status: override.status });
    if (url.pathname === '/api/ideas') {
      return Response.json({
        ideas: [
          {
            id: 'idea-1',
            kind: 'follow_up',
            title: 'Relancer Boulangerie Martin',
            why: 'Ils ont ouvert votre mail mardi.',
            draft: 'Bonjour…',
            sources: [{ label: 'Boulangerie Martin', ref: 'glouton:lead/42' }, { label: 'Site', ref: 'https://martin.test/' }],
            status: 'new',
            created_at: '2026-11-10T08:00:00Z',
            expires_at: '2026-11-12T08:00:00Z',
          },
        ],
        generating: true,
        last_batch_at: '2026-11-10T08:00:00Z',
      });
    }
    if (url.pathname === '/api/ideas/generate') return Response.json({ batch_id: 'batch-1' }, { status: 202 });
    if (url.pathname.endsWith('/run')) return Response.json({ run_id: 'run-1', session_id: 's-1', idea_id: 'idea-1' }, { status: 202 });
    if (url.pathname.startsWith('/api/runs/run-1/approvals/')) return Response.json({});
    if (url.pathname === '/api/runs/run-1') {
      return Response.json({
        id: 'run-1',
        session_id: 's-1',
        status: 'waiting',
        summary: 'Je prépare le brouillon.',
        outputs: [],
        pending_approvals: [{ call_id: 'call 1', tool: 'glouton_save_draft', args: { subject: 'Relance' }, decide_path: '/api/runs/run-1/approvals/call%201' }],
        continue_path: '/s/s-1',
      });
    }
    if (method === 'PATCH') return Response.json({ id: 'idea-1', status: 'dismissed' });
    return Response.json({ error: { message: 'not found' } }, { status: 404 });
  };
  const tokens = {
    token: async (userId: string, target: unknown) => {
      targets.push(target);
      return `exchanged-${userId}`;
    },
    forget: () => {},
  };
  const bulle = createBulle({ bulleUrl: 'https://bulle.test/', tokens: tokens as never, fetch: fetchImpl as typeof fetch });
  return { bulle, seen, targets };
}

function reader(ai: { personal: boolean; team: boolean }) {
  return {
    team: async (_userId: string, teamId: string) =>
      teamId === TEAM ? { allowed: true, enforced: true, upgradeUrl: UPGRADE, aiAccess: ai.team } : null,
    personal: async () => ({ allowed: true, enforced: true, upgradeUrl: UPGRADE, aiAccess: ai.personal }),
    entitledScopes: async () => ({ personal: true, teamIds: [TEAM] }),
  };
}

const prisma = {
  team: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === TEAM ? { registreSpaceId: 'reg-space-a' } : null) },
};

async function call<T = unknown>(
  path: string,
  input: unknown,
  deps: { bulle: unknown; ai?: { personal: boolean; team: boolean } },
  mutation = true
) {
  const req = mutation
    ? new Request(`http://g.test/trpc/${path}`, { method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' } })
    : new Request(`http://g.test/trpc/${path}${input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`}`);
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
        forfait: reader(deps.ai ?? { personal: true, team: true }),
        bulle: deps.bulle,
        planMode: 'paid',
        env: { OIDC_ISSUER: 'https://sso.test' },
      }) as never,
  });
  const body = (await res.json()) as Body;
  return { status: res.status, data: body.result?.data as T, error: body.error };
}

describe('ideas proxy to Bulle', () => {
  test('every call carries the user token exchanged for audience bulle with read and write scopes', async () => {
    const { bulle, seen, targets } = fakeBulle();
    const res = await call('ideas.list', { teamId: TEAM }, { bulle }, false);
    expect(res.status).toBe(200);
    expect(targets).toEqual([{ audience: 'bulle', scopes: 'bulle.read bulle.write', label: 'Bulle' }]);
    expect(seen[0]?.auth).toBe('Bearer exchanged-user-1');
  });

  test('a team call passes its Registre space and the glouton app; personal sends no space', async () => {
    const team = fakeBulle();
    const list = await call<IdeasPageView>('ideas.list', { teamId: TEAM }, { bulle: team.bulle }, false);
    expect(team.seen[0]?.path).toBe('/api/ideas');
    expect(team.seen[0]?.search.get('app')).toBe('glouton');
    expect(team.seen[0]?.search.get('space_id')).toBe('reg-space-a');
    expect(list.data.generating).toBe(true);
    expect(list.data.ideas[0]?.sources).toEqual([{ label: 'Boulangerie Martin' }, { label: 'Site', href: 'https://martin.test/' }]);

    await call('ideas.generate', { teamId: TEAM }, { bulle: team.bulle });
    expect(team.seen[1]?.path).toBe('/api/ideas/generate');
    expect(team.seen[1]?.search.get('app')).toBe('glouton');
    expect(team.seen[1]?.body).toEqual({ space_id: 'reg-space-a' });

    await call('ideas.run', { teamId: TEAM, ideaId: 'idea-1' }, { bulle: team.bulle });
    expect(team.seen[2]?.path).toBe('/api/ideas/idea-1/run');
    expect(team.seen[2]?.search.get('space_id')).toBe('reg-space-a');

    const personal = fakeBulle();
    await call('ideas.list', undefined, { bulle: personal.bulle }, false);
    expect(personal.seen[0]?.search.get('app')).toBe('glouton');
    expect(personal.seen[0]?.search.has('space_id')).toBe(false);
  });

  test('a team the caller is not in is refused before Bulle is called', async () => {
    const { bulle, seen } = fakeBulle();
    expect((await call('ideas.list', { teamId: OTHER_TEAM }, { bulle }, false)).status).toBe(403);
    expect((await call('ideas.run', { teamId: OTHER_TEAM, ideaId: 'idea-1' }, { bulle })).status).toBe(403);
    expect(seen).toHaveLength(0);
  });

  test('decide and dismiss build Bulle paths themselves, encoded', async () => {
    const { bulle, seen } = fakeBulle();
    expect((await call('ideas.decide', { runId: 'run-1', callId: 'call 1', approve: true }, { bulle })).status).toBe(200);
    expect(seen[0]).toMatchObject({ method: 'POST', path: '/api/runs/run-1/approvals/call%201', body: { approve: true } });
    await call('ideas.dismiss', { ideaId: '../runs/x' }, { bulle });
    expect(seen[1]).toMatchObject({ method: 'PATCH', path: '/api/ideas/..%2Fruns%2Fx', body: { status: 'dismissed' } });
  });

  test('a run waiting on a call maps to an approval card with the continue link', async () => {
    const { bulle } = fakeBulle();
    const res = await call<RunView>('ideas.runStatus', { runId: 'run-1' }, { bulle }, false);
    expect(res.data).toEqual({
      runId: 'run-1',
      state: 'needs_approval',
      summary: 'Je prépare le brouillon.',
      outputs: [],
      approvals: [{ callId: 'call 1', tool: 'glouton_save_draft', args: { subject: 'Relance' } }],
      continueHref: 'https://bulle.test/s/s-1',
    });
  });

  test('a Bulle 402 on generate or run comes back with the upgrade link', async () => {
    const refusal = { status: 402, body: { error: { message: 'AI needs a paid plan.', upgrade_url: 'https://sso.test/upgrade' } } };
    const { bulle } = fakeBulle({ 'POST /api/ideas/generate': refusal, 'POST /api/ideas/idea-1/run': refusal });
    for (const [path, input] of [['ideas.generate', {}], ['ideas.run', { ideaId: 'idea-1' }]] as const) {
      const res = await call(path, input, { bulle });
      expect(res.status).toBe(403);
      expect(res.error?.data?.plan_limit).toMatchObject({ upgrade_url: 'https://sso.test/upgrade' });
    }
  });

  test('a space without ai.access gets the upsell: list says so, generate refuses, Bulle is never called', async () => {
    const { bulle, seen } = fakeBulle();
    const ai = { personal: false, team: false };
    const list = await call<IdeasPageView>('ideas.list', { teamId: TEAM }, { bulle, ai }, false);
    expect(list.data).toMatchObject({ aiAccess: false, upgradeUrl: UPGRADE, ideas: [] });
    const generate = await call('ideas.generate', { teamId: TEAM }, { bulle, ai });
    expect(generate.error?.data?.plan_limit).toMatchObject({ key: 'ai.access', upgrade_url: UPGRADE });
    expect(seen).toHaveLength(0);
  });

  test('Bulle refusals keep their meaning: the daily cap is 429, a busy batch 409', async () => {
    const { bulle } = fakeBulle({ 'POST /api/ideas/generate': { status: 429, body: { error: { message: 'at most 3 batches per day' } } } });
    const capped = await call('ideas.generate', {}, { bulle });
    expect(capped.status).toBe(429);
    expect(capped.error?.message).toBe('at most 3 batches per day');
    const busy = fakeBulle({ 'POST /api/ideas/generate': { status: 409, body: { error: { message: 'a batch is already running' } } } });
    expect((await call('ideas.generate', {}, { bulle: busy.bulle })).status).toBe(409);
  });
});

describe('run polling state mapping', () => {
  test('a finished run keeps only web output links', async () => {
    const finished = {
      id: 'run-2',
      session_id: 's-2',
      status: 'finished',
      summary: 'Brouillon enregistré.',
      outputs: [
        { tool: 'glouton_save_draft', url: 'https://glouton.test/app/messages/inbox', preview: 'Brouillon pour Martin' },
        { tool: 'glouton_suggest', url: 'javascript:alert(1)' },
        { tool: 'opus_create_task', url: '' },
      ],
      pending_approvals: [],
    };
    const { bulle } = fakeBulle({ 'GET /api/runs/run-2': { status: 200, body: finished } });
    const view = (await call<RunView>('ideas.runStatus', { runId: 'run-2' }, { bulle }, false)).data;
    expect(view.state).toBe('done');
    expect(view.outputs).toEqual([{ label: 'Brouillon pour Martin', href: 'https://glouton.test/app/messages/inbox' }]);
    expect(view.continueHref).toBe('https://bulle.test/s/s-2');
  });
});
