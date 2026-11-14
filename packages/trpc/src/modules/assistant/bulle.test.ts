import { describe, expect, test } from 'bun:test';
import { COURRIER_AUDIENCE, COURRIER_SCOPES, RegistreReconnectError, RegistreTokens } from '@repo/courrier';
import { BULLE_TARGET, PlanRequired, complete, createBulle, planLimitOf } from './bulle';
import { assistantError, assistantStatus } from './service';

interface Seen {
  url: string;
  init: RequestInit;
}

const PAID = { allowed: true, upgradeUrl: 'https://sso.test/spaces' };

function fakeSuite(options: { noPlan?: boolean; refreshToken?: string | null; upgradeUrl?: string } = {}) {
  const seen: Seen[] = [];
  let refreshes = 0;
  let current = options.refreshToken === undefined ? 'rt-1' : options.refreshToken;
  const fakeFetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    seen.push({ url, init });
    if (url.endsWith('/.well-known/openid-configuration')) {
      return Response.json({ token_endpoint: 'https://registre.test/oauth/token' });
    }
    if (url === 'https://registre.test/oauth/token') {
      const form = new URLSearchParams(String(init.body));
      if (form.get('grant_type') === 'refresh_token') {
        if (form.get('refresh_token') !== current) return Response.json({ error: 'invalid_grant' }, { status: 400 });
        refreshes++;
        current = `rt-${refreshes + 1}`;
        return Response.json({ access_token: `registre-${refreshes}`, refresh_token: current, expires_in: 300 });
      }
      return Response.json({ access_token: `${form.get('audience')}-token`, expires_in: 300 });
    }
    const path = new URL(url).pathname;
    if (path === '/api/assistant') return Response.json({ name: 'Pip', avatar_url: 'https://bulle.test/pip.png' });
    if (options.noPlan) {
      const upgrade = options.upgradeUrl ?? 'https://sso.test/spaces';
      return Response.json({ error: { code: 'payment_required', message: 'AI features need a paid plan.', upgrade_url: upgrade, key: 'ai.access', limit: 3 } }, { status: 402 });
    }
    if (path === '/api/ai/complete') return Response.json({ text: ' {"subject":"Hi","body":"Hello","note":null} ', model: 'm-1' });
    return Response.json({ error: { message: 'not found' } }, { status: 404 });
  }) as typeof fetch;
  const tokens = new RegistreTokens({
    issuer: 'https://registre.test/',
    clientId: 'glouton',
    clientSecret: 'secret',
    fetch: fakeFetch,
    store: { load: async () => current, save: async (_user, token) => void (current = token) },
  });
  const bulle = createBulle({ bulleUrl: 'https://bulle.test/', tokens, fetch: fakeFetch });
  return { bulle, tokens, seen, refreshes: () => refreshes };
}

function sentBody(seen: Seen[], suffix: string) {
  const call = seen.find((s) => s.url.endsWith(suffix));
  if (!call) throw new Error(`no call to ${suffix}`);
  return { body: JSON.parse(String(call.init.body)), headers: new Headers(call.init.headers) };
}

describe('the Bulle client', () => {
  test('completes through /api/ai/complete with the exchanged token, the task and the data apart, and no space_id', async () => {
    const suite = fakeSuite();
    const answer = await complete(suite.bulle, 'u1', { system: 'SYSTEM', prompt: 'TASK', input: 'DATA', maxTokens: 100 });
    expect(answer).toBe('{"subject":"Hi","body":"Hello","note":null}');
    const { body, headers } = sentBody(suite.seen, '/api/ai/complete');
    expect(body).toEqual({ system: 'SYSTEM', prompt: 'TASK', input: 'DATA', max_tokens: 100 });
    expect(headers.get('authorization')).toBe('Bearer bulle-token');
    expect(suite.seen.some((s) => s.url.includes('/api/llm'))).toBe(false);
  });

  test('reports the assistant profile, and a lost grant as not_linked', async () => {
    expect(await assistantStatus(fakeSuite().bulle, 'u1', PAID)).toEqual({
      available: true,
      reason: null,
      name: 'Pip',
      avatarUrl: 'https://bulle.test/pip.png',
    });
    const unlinked = fakeSuite({ refreshToken: null });
    expect((await assistantStatus(unlinked.bulle, 'u1', PAID)).reason).toBe('not_linked');
    const error = await complete(unlinked.bulle, 'u1', { prompt: 'TASK' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RegistreReconnectError);
    expect(() => assistantError(error)).toThrow('Reconnectez votre compte Facile');
    expect((await assistantStatus(null, 'u1', PAID)).reason).toBe('unreachable');
  });

  test('Courrier and Bulle tokens for one user share a single refresh', async () => {
    const suite = fakeSuite();
    const courrier = { audience: COURRIER_AUDIENCE, scopes: COURRIER_SCOPES, label: 'Courrier' };
    const [a, b] = await Promise.all([suite.tokens.token('u1', courrier), suite.tokens.token('u1', BULLE_TARGET)]);
    expect([a, b]).toEqual([`${COURRIER_AUDIENCE}-token`, 'bulle-token']);
    expect(suite.refreshes()).toBe(1);
    const exchange = suite.seen
      .map((s) => new URLSearchParams(String(s.init.body)))
      .find((form) => form.get('audience') === 'bulle');
    expect(exchange?.get('scope')).toBe('bulle.read bulle.write');
  });
});

describe('a plan without AI', () => {
  test("Bulle's 402 becomes FORBIDDEN with the plan limit and its upgrade link", async () => {
    const { bulle } = fakeSuite({ noPlan: true });
    const error = await complete(bulle, 'user-1', { prompt: 'TASK' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanRequired);
    let refused: { code?: string; cause?: unknown } = {};
    try {
      assistantError(error);
    } catch (thrown) {
      refused = thrown as typeof refused;
    }
    expect(refused.code).toBe('FORBIDDEN');
    expect(planLimitOf(refused)).toEqual({
      message: 'AI features need a paid plan.',
      upgrade_url: 'https://sso.test/spaces',
      key: 'ai.access',
      limit: 3,
    });
  });

  test('an unsafe upgrade URL never reaches the page', async () => {
    const { bulle } = fakeSuite({ noPlan: true, upgradeUrl: 'javascript:alert(1)' });
    const error = await complete(bulle, 'user-1', { prompt: 'TASK' }).catch((e: unknown) => e);
    expect(planLimitOf({ cause: error })?.upgrade_url).toBeUndefined();
  });

  test('status reports plan_required from the scope plan before calling Bulle', async () => {
    const suite = fakeSuite();
    const status = await assistantStatus(suite.bulle, 'user-1', { allowed: false, upgradeUrl: 'https://sso.test/spaces/s1' });
    expect(status.available).toBe(false);
    expect(status.reason).toBe('plan_required');
    expect(status.planLimit).toMatchObject({ key: 'ai.access', upgrade_url: 'https://sso.test/spaces/s1' });
    expect(suite.seen).toHaveLength(0);
  });
});
