import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWebSearch, limitsFromEnv, WebSearchError, type KeyValueStore } from './index';
import { parseFetchOutput, parseSearchOutput } from './runner';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  ttl = new Map<string, number>();
  async get(key: string) {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string, _mode: 'EX', seconds: number) {
    this.data.set(key, value);
    this.ttl.set(key, seconds);
  }
  async incrby(key: string, n: number) {
    const next = Number(this.data.get(key) ?? 0) + n;
    this.data.set(key, String(next));
    return next;
  }
  async decrby(key: string, n: number) {
    return this.incrby(key, -n);
  }
  async expire(key: string, seconds: number) {
    this.ttl.set(key, seconds);
  }
}

const SCRIPT = `#!/bin/sh
echo "$@" >> "$FAKE_LOG"
case "$FAKE_MODE" in
  fail) printf '\\033[1m ERROR \\033[0m\\n  Unknown engine "x".\\n' >&2; exit 1 ;;
  hang) sleep 30 ;;
  huge) head -c 100000 /dev/zero | tr '\\0' 'a'; exit 0 ;;
  garbage) echo 'not json'; exit 0 ;;
esac
if [ "$1" = "search" ]; then
  printf '[{"Title":"A &amp; <strong>B</strong>","Snippet":"s &quot;q&quot;","URL":"https://a.example/x","Engine":"brave"},{"Title":"bad","Snippet":"","URL":"javascript:alert(1)","Engine":"exa"}]'
else
  n=0; for a in "$@"; do case "$a" in http*) n=$((n+1)) ;; esac; done
  if [ "$n" -gt 1 ]; then printf '# https://a.example/\\none\\n\\n# https://b.example/\\ntwo\\n'; else printf 'page body\\n'; fi
fi
`;

let dir: string;
let log: string;

function client(env: Record<string, string> = {}, extra: Record<string, unknown> = {}) {
  const store = new MemoryStore();
  const ws = createWebSearch({
    store,
    bin: 'sonar',
    env: { PATH: `${dir}:${process.env.PATH}`, FAKE_LOG: log, ...env },
    limits: { searches: 2, fetches: 3 },
    ...extra,
  });
  return { store, ws };
}

function calls(): string[] {
  return readFileSync(log, 'utf8').split('\n').filter(Boolean);
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof WebSearchError ? error.code : 'other';
  }
  return 'none';
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'fake-sonar-'));
  log = join(dir, 'calls.log');
  writeFileSync(log, '');
  writeFileSync(join(dir, 'sonar'), SCRIPT);
  chmodSync(join(dir, 'sonar'), 0o755);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('search', () => {
  it('parses, cleans and validates results', async () => {
    const { ws } = client();
    const results = await ws.search('team', 'open source crm', { count: 5, engines: ['Brave'] });
    expect(results).toEqual([{ title: 'A & B', snippet: 's "q"', url: 'https://a.example/x', engine: 'brave' }]);
    expect(calls().at(-1)).toBe('search --json -n 5 --engines brave -- open source crm');
  });

  it('keeps a dash-leading query as one argument after --', async () => {
    const { ws } = client();
    await ws.search('team', '-rf; $(whoami) `id`');
    expect(calls().at(-1)).toBe('search --json -- -rf; $(whoami) `id`');
  });

  it('serves the second identical search from the cache without quota', async () => {
    const { ws, store } = client();
    const before = calls().length;
    await ws.search('team', 'cached query');
    await ws.search('team', '  cached   query ');
    expect(calls().length - before).toBe(1);
    expect((await ws.usage('team')).searches).toBe(1);
    expect([...store.ttl.values()]).toContain(3600);
  });

  it('enforces the daily quota per team and refunds failures', async () => {
    const { ws } = client();
    await ws.search('t1', 'one');
    await ws.search('t1', 'two');
    expect(await codeOf(ws.search('t1', 'three'))).toBe('quota_exceeded');
    expect((await ws.usage('t1')).searches).toBe(2);
    await ws.search('t2', 'one');
    const failing = client({ FAKE_MODE: 'fail' });
    expect(await codeOf(failing.ws.search('t', 'x'))).toBe('sonar_failed');
    expect((await failing.ws.usage('t')).searches).toBe(0);
  });

  it('maps failures to codes', async () => {
    expect(await codeOf(client({ FAKE_MODE: 'garbage' }).ws.search('t', 'x'))).toBe('bad_output');
    expect(await codeOf(client({ FAKE_MODE: 'huge' }, { maxOutputBytes: 1000 }).ws.search('t', 'x'))).toBe(
      'output_too_large'
    );
    const started = Date.now();
    expect(await codeOf(client({ FAKE_MODE: 'hang' }).ws.search('t', 'x', { timeoutMs: 300 }))).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(5000);
    const missing = createWebSearch({ store: new MemoryStore(), bin: '/nonexistent/sonar', env: {} });
    expect(await codeOf(missing.search('t', 'x'))).toBe('not_installed');
  });

  it('does not leak the stderr box drawing into the message', async () => {
    const { ws } = client({ FAKE_MODE: 'fail' });
    const error = await ws.search('t', 'x').catch((caught: Error) => caught);
    expect((error as Error).message).toBe('Unknown engine "x".');
  });

  it('rejects bad input before spawning', async () => {
    const { ws } = client();
    const before = calls().length;
    expect(await codeOf(ws.search('t', '   '))).toBe('invalid_input');
    expect(await codeOf(ws.search('t', 'x'.repeat(401)))).toBe('invalid_input');
    expect(await codeOf(ws.search('t', 'x', { count: 0 }))).toBe('invalid_input');
    expect(await codeOf(ws.search('t', 'x', { engines: ['brave --evil'] }))).toBe('invalid_input');
    expect(await codeOf(ws.search('', 'x'))).toBe('invalid_input');
    expect(calls().length).toBe(before);
  });
});

describe('fetch', () => {
  it('returns one page and counts one fetch', async () => {
    const { ws } = client();
    const pages = await ws.fetch('team', ['https://a.example/'], { selector: 'main' });
    expect(pages).toEqual([{ url: 'https://a.example/', markdown: 'page body' }]);
    expect(calls().at(-1)).toMatch(/^fetch --timeout 85s --selector main -- https:\/\/a\.example\/$/);
    expect((await ws.usage('team')).fetches).toBe(1);
  });

  it('splits several pages and charges one fetch per url', async () => {
    const { ws } = client();
    const pages = await ws.fetch('team', ['https://a.example', 'https://b.example']);
    expect(pages).toEqual([
      { url: 'https://a.example/', markdown: 'one' },
      { url: 'https://b.example/', markdown: 'two' },
    ]);
    expect((await ws.usage('team')).fetches).toBe(2);
    expect(await codeOf(ws.fetch('team', ['https://c.example', 'https://d.example']))).toBe('quota_exceeded');
  });

  it('refuses internal and non-http urls', async () => {
    const { ws } = client();
    for (const url of [
      'http://localhost/',
      'http://127.0.0.1/',
      'http://10.0.0.5/',
      'http://169.254.169.254/latest',
      'http://glouton-redis:6379/',
      'http://[::1]/',
      'file:///etc/passwd',
      'https://user:pw@a.example/',
      'not a url',
    ]) {
      expect(await codeOf(ws.fetch('t', [url]))).toBe('invalid_input');
    }
  });
});

describe('helpers', () => {
  it('reads limits from the environment with defaults', () => {
    expect(limitsFromEnv({})).toEqual({ searches: 50, fetches: 200 });
    expect(limitsFromEnv({ WEBSEARCH_DAILY_QUOTA: '7', WEBSEARCH_DAILY_FETCH_QUOTA: 'x' })).toEqual({
      searches: 7,
      fetches: 200,
    });
  });

  it('parses edge outputs', () => {
    expect(parseSearchOutput('null')).toEqual([]);
    expect(() => parseSearchOutput('{}')).toThrow(WebSearchError);
    expect(parseFetchOutput('# https://a/\nx\n', ['https://a/', 'https://b/'])).toEqual([
      { url: 'https://a/', markdown: 'x' },
      { url: 'https://b/', markdown: '' },
    ]);
  });
});
