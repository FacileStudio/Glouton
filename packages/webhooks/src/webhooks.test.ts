import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import type { Resolver } from '@repo/websearch';
import { postPinned, sendWebhook, webhookTransport, type WebhookPayload } from './index';

const payload: WebhookPayload = {
  app: 'glouton',
  event: 'webhook.test',
  timestamp: '2026-11-08T00:00:00.000Z',
  team: { id: 't1', name: 'Team' },
  data: {},
};

const original = { ...webhookTransport };
const seen: Array<{ host: string | null; path: string }> = [];
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (req) => {
      const url = new URL(req.url);
      seen.push({ host: req.headers.get('host'), path: url.pathname });
      if (url.pathname === '/redirect') return Response.redirect('http://169.254.169.254/latest/meta-data', 302);
      return new Response('ok');
    },
  });
});

afterAll(() => server.stop(true));

afterEach(() => {
  Object.assign(webhookTransport, original);
  seen.length = 0;
});

const toLocal: typeof postPinned = (target, _address, body, headers, timeoutMs) => {
  const local = new URL(target);
  local.port = String(server.port);
  local.protocol = 'http:';
  return postPinned(local, { address: '127.0.0.1', family: 4 }, body, headers, timeoutMs);
};

async function errorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return (error as Error).message;
  }
}

describe('sendWebhook guard', () => {
  it('refuses internal urls before any network call', async () => {
    let calls = 0;
    webhookTransport.resolve = async () => {
      calls++;
      return [{ address: '188.114.96.1', family: 4 }];
    };
    webhookTransport.post = async () => {
      calls++;
      return 200;
    };
    for (const url of [
      `http://127.0.0.1:${server.port}/hook`,
      'http://localhost/hook',
      'http://10.0.0.1/hook',
      'http://169.254.169.254/latest',
      'http://[::1]/hook',
      'http://glouton-backend:3001/hook',
      'https://user:pw@hooks.example.com/',
      'file:///etc/passwd',
    ]) {
      expect({ url, error: await errorOf(sendWebhook(url, payload)) }).not.toEqual({ url, error: 'ok' });
    }
    expect(calls).toBe(0);
  });

  it('pins the connection to the address it checked, so a DNS rebind cannot redirect it', async () => {
    const answers = [
      [{ address: '188.114.96.1', family: 4 }],
      [{ address: '127.0.0.1', family: 4 }],
    ];
    let lookups = 0;
    webhookTransport.resolve = async () => answers[lookups++]!;
    const used: string[] = [];
    webhookTransport.post = async (_target, address) => {
      used.push(address.address);
      return 200;
    };
    await sendWebhook('https://rebind.example.com/hook', payload);
    expect(lookups).toBe(1);
    expect(used).toEqual(['188.114.96.1']);

    expect(await errorOf(sendWebhook('https://rebind.example.com/hook', payload))).toBe('host resolves to an internal address');
    expect(used).toEqual(['188.114.96.1']);
  });

  it('refuses a name when one of its addresses is internal', async () => {
    const mixed: Resolver = async () => [
      { address: '188.114.96.1', family: 4 },
      { address: '192.168.1.10', family: 4 },
    ];
    webhookTransport.resolve = mixed;
    webhookTransport.post = async () => 200;
    expect(await errorOf(sendWebhook('https://mixed.example.com/hook', payload))).toBe('host resolves to an internal address');
  });

  it('does not follow a redirect to an internal address', async () => {
    webhookTransport.resolve = async () => [{ address: '188.114.96.1', family: 4 }];
    webhookTransport.post = toLocal;
    expect(await errorOf(sendWebhook('https://hooks.example.com/redirect', payload))).toBe(
      'redirects are not followed (HTTP 302)'
    );
    expect(seen).toEqual([{ host: `hooks.example.com:${server.port}`, path: '/redirect' }]);
  });

  it('delivers to Antenne at its public https url', async () => {
    webhookTransport.resolve = async (host) =>
      host === 'antenne.facile.studio'
        ? [
            { address: '2a06:98c1:3120::1', family: 6 },
            { address: '188.114.96.1', family: 4 },
          ]
        : [];
    const sent: Array<{ url: string; address: string; event: string }> = [];
    webhookTransport.post = async (target, address, body, headers) => {
      sent.push({ url: target.toString(), address: address.address, event: headers['X-Webhook-Event']! });
      expect(JSON.parse(body).event).toBe('webhook.test');
      return 200;
    };
    await sendWebhook('https://antenne.facile.studio/webhook/glouton', payload);
    expect(sent).toEqual([
      { url: 'https://antenne.facile.studio/webhook/glouton', address: '188.114.96.1', event: 'webhook.test' },
    ]);
  });
});

describe('postPinned', () => {
  it('connects to the pinned address and keeps the url host', async () => {
    const status = await postPinned(
      new URL(`http://pinned.example.com:${server.port}/hook?x=1`),
      { address: '127.0.0.1', family: 4 },
      '{}',
      { 'Content-Type': 'application/json' }
    );
    expect(status).toBe(200);
    expect(seen).toEqual([{ host: `pinned.example.com:${server.port}`, path: '/hook' }]);
  });

  it('returns a redirect status without following it', async () => {
    const status = await postPinned(
      new URL(`http://pinned.example.com:${server.port}/redirect`),
      { address: '127.0.0.1', family: 4 },
      '{}',
      {}
    );
    expect(status).toBe(302);
    expect(seen).toHaveLength(1);
  });
});
