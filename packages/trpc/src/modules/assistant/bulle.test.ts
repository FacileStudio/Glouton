import { describe, expect, test } from 'bun:test';
import { COURRIER_AUDIENCE, COURRIER_SCOPES, RegistreTokens } from '@repo/courrier';
import { BULLE_TARGET, BulleClient, BulleUnavailableError } from './bulle';
import { assistantStatus } from './service';

interface Seen {
  url: string;
  init: RequestInit;
}

function fakeSuite(options: { backend: string; noKey?: boolean; refreshToken?: string | null }) {
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
    if (path === '/api/llm') {
      return Response.json({ backend: options.backend, model: 'm-1', models: ['m-1', 'm-2'], persona: 'You are Pip.' });
    }
    if (path === '/api/assistant') return Response.json({ name: 'Pip', avatar_url: 'https://bulle.test/pip.png' });
    if (options.noKey) return Response.json({ error: `no key for ${options.backend}` }, { status: 409 });
    if (path === '/api/llm/anthropic/v1/messages') {
      return Response.json({ content: [{ type: 'text', text: '{"subject":"Hi","body":"Hello","note":null}' }] });
    }
    if (path === '/api/llm/openrouter/chat/completions' || path === '/api/llm/openai/chat/completions') {
      return Response.json({ choices: [{ message: { role: 'assistant', content: 'Bonjour' } }] });
    }
    return Response.json({ ok: true });
  }) as typeof fetch;
  const tokens = new RegistreTokens({
    issuer: 'https://registre.test/',
    clientId: 'glouton',
    clientSecret: 'secret',
    fetch: fakeFetch,
    store: { load: async () => current, save: async (_user, token) => void (current = token) },
  });
  const bulle = new BulleClient({ bulleUrl: 'https://bulle.test/', tokens, fetch: fakeFetch });
  return { bulle, tokens, seen, refreshes: () => refreshes };
}

const prompt = { system: 'SYSTEM', user: 'USER', maxTokens: 100 };

function sentBody(seen: Seen[], suffix: string) {
  const call = seen.find((s) => s.url.endsWith(suffix));
  if (!call) throw new Error(`no call to ${suffix}`);
  return { body: JSON.parse(String(call.init.body)), headers: call.init.headers as Record<string, string> };
}

describe('BulleClient', () => {
  test('speaks the Anthropic messages format to the anthropic backend', async () => {
    const suite = fakeSuite({ backend: 'anthropic' });
    const offer = await suite.bulle.offer('u1');
    expect(offer).toEqual({ backend: 'anthropic', model: 'm-1', models: ['m-1', 'm-2'], persona: 'You are Pip.' });
    expect(await suite.bulle.complete('u1', offer, prompt)).toBe('{"subject":"Hi","body":"Hello","note":null}');
    const { body, headers } = sentBody(suite.seen, '/api/llm/anthropic/v1/messages');
    expect(body).toEqual({ model: 'm-1', max_tokens: 100, system: 'SYSTEM', messages: [{ role: 'user', content: 'USER' }] });
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers.Authorization).toBe('Bearer bulle-token');
  });

  test('speaks OpenAI-compatible chat to openrouter', async () => {
    const suite = fakeSuite({ backend: 'openrouter' });
    const offer = await suite.bulle.offer('u1');
    expect(await suite.bulle.complete('u1', offer, prompt)).toBe('Bonjour');
    const { body } = sentBody(suite.seen, '/api/llm/openrouter/chat/completions');
    expect(body.messages).toEqual([
      { role: 'system', content: 'SYSTEM' },
      { role: 'user', content: 'USER' },
    ]);
    expect(body.system).toBeUndefined();
  });

  test('maps a Bulle 409 to no_key, in the client and in status', async () => {
    const suite = fakeSuite({ backend: 'openai', noKey: true });
    const offer = await suite.bulle.offer('u1');
    const error = await suite.bulle.complete('u1', offer, prompt).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BulleUnavailableError);
    expect((error as BulleUnavailableError).reason).toBe('no_key');
    expect(await assistantStatus(suite.bulle, 'u1')).toEqual({
      available: false,
      reason: 'no_key',
      name: 'Pip',
      avatarUrl: 'https://bulle.test/pip.png',
      model: 'm-1',
    });
  });

  test('refuses the google backend and reports a lost grant as not_linked', async () => {
    const google = fakeSuite({ backend: 'google' });
    const offer = await google.bulle.offer('u1');
    const error = await google.bulle.complete('u1', offer, prompt).catch((e: unknown) => e);
    expect((error as BulleUnavailableError).reason).toBe('unsupported');
    const unlinked = fakeSuite({ backend: 'openrouter', refreshToken: null });
    expect((await assistantStatus(unlinked.bulle, 'u1')).reason).toBe('not_linked');
    expect((await assistantStatus(null, 'u1')).reason).toBe('unreachable');
  });

  test('Courrier and Bulle tokens for one user share a single refresh', async () => {
    const suite = fakeSuite({ backend: 'openrouter' });
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
