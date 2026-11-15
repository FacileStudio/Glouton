import { RegistreReconnectError } from '@repo/courrier';
import { createBulle } from '../assistant/bulle';

/** What the fake Bulle saw of one completion. */
export interface SeenCompletion {
  system: string;
  prompt: string;
  input: string;
  spaceId?: string;
}

/** A Bulle stand-in at the HTTP level, so the real tronc client parses its answers, a 402 and a 429 included. */
export function fakeBulle(options: { reconnect?: boolean } = {}) {
  const state = {
    answers: [] as Array<string | { status: number; body: unknown }>,
    seen: [] as SeenCompletion[],
  };
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    if (new URL(String(url)).pathname !== '/api/ai/complete') return Response.json({ error: { message: 'not found' } }, { status: 404 });
    const body = JSON.parse(String(init?.body)) as { system: string; prompt: string; input?: string; space_id?: string };
    state.seen.push({ system: body.system, prompt: body.prompt, input: body.input ?? '', spaceId: body.space_id });
    const next = state.answers.shift() ?? '{}';
    if (typeof next !== 'string') return Response.json(next.body, { status: next.status });
    return Response.json({ text: next, model: 'm-1' });
  };
  const tokens = {
    token: async () => {
      if (options.reconnect) throw new RegistreReconnectError();
      return 'token';
    },
    forget: () => {},
  };
  const bulle = createBulle({ bulleUrl: 'https://bulle.test', tokens: tokens as never, fetch: fetchImpl as typeof fetch });
  return { bulle, state };
}

/** A forfait reader whose ai.access is fixed for personal work and per team. */
export function fakeForfait(options: { personalAi: boolean; teams?: Record<string, boolean> }) {
  const verdict = (aiAccess: boolean) => ({ allowed: true, enforced: true, upgradeUrl: 'https://sso.test/spaces', aiAccess });
  const teams = options.teams ?? {};
  return {
    team: async (_userId: string, teamId: string) => (teamId in teams ? { ...verdict(teams[teamId]!), spaceId: `space-${teamId}` } : null),
    personal: async () => verdict(options.personalAi),
    entitledScopes: async () => ({ personal: true, teamIds: Object.keys(teams) }),
  };
}
