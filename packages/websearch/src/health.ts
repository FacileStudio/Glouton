import { parseSearchOutput, runSonar } from './runner';
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

async function main(): Promise<void> {
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
