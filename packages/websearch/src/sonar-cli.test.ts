import { describe, expect, test } from 'bun:test';
import { runSonar } from './runner';
import { WebSearchError } from './types';

/**
 * Pins the sonar CLI contract the client relies on against a real binary:
 * every flag `client.ts` passes, and the public-only refusal. Set SONAR_BIN
 * to the binary the backend image ships to run it.
 */
const bin = process.env.SONAR_BIN;
const config = { bin: bin ?? 'sonar', env: process.env, timeoutMs: 30_000, maxOutputBytes: 1024 * 1024 };

const help = (command: string) =>
  Bun.spawnSync([config.bin, command, '--help'], { env: process.env }).stdout.toString();

describe.skipIf(!bin)('sonar CLI contract', () => {
  test('search takes --json, -n and --engines', () => {
    const text = help('search');
    for (const flag of ['--json', '-n', '--count', '--engines']) expect(text).toContain(flag);
  });

  test('fetch takes --public-only, --timeout, --selector and --browser', () => {
    const text = help('fetch');
    for (const flag of ['--public-only', '--timeout', '--selector', '--browser']) expect(text).toContain(flag);
  });

  test('fetch --public-only refuses an internal address with a non-zero exit', async () => {
    const error = await runSonar(config, ['fetch', '--public-only', '--timeout', '10s', '--', 'http://169.254.169.254/'])
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WebSearchError);
    expect((error as WebSearchError).message).toContain('blocked_internal');
  });
});
