import { describe, expect, test } from 'bun:test';

process.env.DATABASE_URL ??= 'postgresql://unused@localhost/unused';

const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch');
const { appRouter } = await import('@repo/trpc');

const silent = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {}, child: () => silent };
const user = { id: 'user-1', email: 'a@x.test', role: 'USER' };

/** Confirms action a1 as a caller: a browser session, a delegated agent, or a bearer token that names no agent. */
async function confirmAs(caller: { session: boolean; actor: string | null; scopes: string[] | null }) {
  const confirmed: string[] = [];
  const mcp = { open: async () => [], dismiss: async () => {}, confirm: async (_userId: string, id: string) => void confirmed.push(id) };
  const res = await fetchRequestHandler({
    endpoint: '/trpc',
    req: new Request('http://g.test/trpc/mcp.confirm', { method: 'POST', body: JSON.stringify({ id: 'a1' }), headers: { 'content-type': 'application/json' } }),
    router: appRouter,
    createContext: () => ({ user, ...caller, log: silent, mcp, planMode: 'paid', env: {} }) as never,
  });
  return { status: res.status, confirmed };
}

describe('the MCP confirm page', () => {
  test("only the person's own browser session confirms", async () => {
    expect(await confirmAs({ session: true, actor: null, scopes: null })).toEqual({ status: 200, confirmed: ['a1'] });
    expect(await confirmAs({ session: false, actor: 'bulle', scopes: ['glouton.read', 'glouton.write'] })).toEqual({ status: 403, confirmed: [] });
    expect(await confirmAs({ session: false, actor: null, scopes: null })).toEqual({ status: 403, confirmed: [] });
  });
});
