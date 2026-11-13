import { parseFetchOutput, parseSearchOutput, runSonar } from './runner';
import { WebSearchError } from './types';

const ENGINES = ['parallel', 'brave', 'tavily', 'exa', 'firecrawl', 'browserbase', 'brightdata', 'linkup'];
const QUERY = 'open source crm';

const config = { bin: 'sonar', env: process.env, timeoutMs: 60_000, maxOutputBytes: 2 * 1024 * 1024 };

async function probe(engines?: string): Promise<{ count: number; engines: string[] }> {
  const args = ['search', '--json', '-n', '5'];
  if (engines) args.push('--engines', engines);
  args.push('--', QUERY);
  const results = parseSearchOutput(await runSonar(config, args));
  return { count: results.length, engines: [...new Set(results.map((result) => result.engine))].sort() };
}

/** Fetches a public page and an internal address through the public-only guard; prints sizes and verdicts only. */
async function fetchProbe(): Promise<void> {
  const url = 'https://example.com/';
  const [page] = parseFetchOutput(await runSonar(config, ['fetch', '--public-only', '--timeout', '20s', '--', url]), [url]);
  console.log(`fetch: ok chars=${page?.markdown.length ?? 0}`);
  const internal = await runSonar(config, ['fetch', '--public-only', '--timeout', '10s', '--', 'http://169.254.169.254/']).then(
    () => 'fail reached',
    (error: unknown) => (error instanceof WebSearchError && error.message.includes('blocked_internal') ? 'ok blocked' : 'fail error')
  );
  console.log(`fetch internal: ${internal}`);
  if ((page?.markdown.length ?? 0) === 0 || !internal.startsWith('ok')) process.exitCode = 1;
}

async function main(): Promise<void> {
  if (process.argv.includes('--fetch')) return fetchProbe();
  if (process.argv.includes('--each')) {
    for (const engine of ENGINES) {
      const outcome = await probe(engine).then(
        (found) => `ok results=${found.count}`,
        (error: unknown) => `fail ${error instanceof WebSearchError ? error.code : 'error'}`
      );
      console.log(`${engine}: ${outcome}`);
    }
    return;
  }
  const found = await probe();
  console.log(`results=${found.count} engines=${found.engines.join(',')}`);
  if (found.count === 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.log(`health failed: ${error instanceof WebSearchError ? error.code : 'error'}`);
  process.exit(1);
});
