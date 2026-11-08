import { WebSearchError, type RunnerConfig, type SearchResult } from './types';

const STDERR_CAP = 8 * 1024;
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
};

async function readCapped(
  stream: ReadableStream<Uint8Array>,
  cap: number,
  onOverflow: () => void
): Promise<{ text: string; overflow: boolean }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let overflow = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      overflow = true;
      onOverflow();
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString('utf8'), overflow };
}

function describeFailure(stderr: string): string {
  const lines = stderr
    .replace(ANSI, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== 'ERROR');
  return lines.join(' ').slice(0, 300) || 'sonar failed';
}

/**
 * Runs the sonar binary with an argument array (never a shell) under a hard
 * timeout and a stdout size cap, and returns its stdout.
 */
export async function runSonar(config: RunnerConfig, args: string[], timeoutMs?: number): Promise<string> {
  const limit = timeoutMs ?? config.timeoutMs;
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn([config.bin, ...args], {
      env: config.env,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch {
    throw new WebSearchError('not_installed', 'sonar binary not found');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new WebSearchError('timeout', `sonar timed out after ${limit} ms`));
    }, limit);
  });

  try {
    const [out, err, code] = await Promise.race([
      Promise.all([
        readCapped(proc.stdout as ReadableStream<Uint8Array>, config.maxOutputBytes, () => proc.kill('SIGKILL')),
        readCapped(proc.stderr as ReadableStream<Uint8Array>, STDERR_CAP, () => undefined),
        proc.exited,
      ]),
      deadline,
    ]);
    if (out.overflow) throw new WebSearchError('output_too_large', 'sonar output exceeded the size cap');
    if (code !== 0) throw new WebSearchError('sonar_failed', describeFailure(err.text));
    return out.text;
  } finally {
    clearTimeout(timer);
  }
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|nbsp|#39|#x27);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates the JSON that `sonar search --json` prints. Entries that do not
 * carry an http(s) URL are dropped; a non-array payload is an error.
 */
export function parseSearchOutput(stdout: string): SearchResult[] {
  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new WebSearchError('bad_output', 'sonar did not return JSON');
  }
  if (data === null) return [];
  if (!Array.isArray(data)) throw new WebSearchError('bad_output', 'sonar returned an unexpected shape');
  const results: SearchResult[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const { Title, Snippet, URL: url, Engine } = item as Record<string, unknown>;
    if (typeof url !== 'string' || !isHttpUrl(url)) continue;
    results.push({
      title: typeof Title === 'string' ? plainText(Title) : '',
      snippet: typeof Snippet === 'string' ? plainText(Snippet) : '',
      url,
      engine: typeof Engine === 'string' ? Engine : '',
    });
  }
  return results;
}

/**
 * Splits the markdown that `sonar fetch` prints. One URL prints the page
 * as is; several URLs print each page under a `# <url>` heading.
 */
export function parseFetchOutput(stdout: string, urls: string[]): { url: string; markdown: string }[] {
  if (urls.length === 1) return [{ url: urls[0], markdown: stdout.trim() }];
  const marks = urls.map((url) => {
    const at = stdout.indexOf(`# ${url}\n`);
    return { url, at: at === 0 || (at > 0 && stdout[at - 1] === '\n') ? at : -1 };
  });
  return marks.map((mark, index) => {
    if (mark.at < 0) return { url: mark.url, markdown: '' };
    const start = mark.at + `# ${mark.url}\n`.length;
    const next = marks.slice(index + 1).find((later) => later.at > mark.at);
    return { url: mark.url, markdown: stdout.slice(start, next ? next.at : undefined).trim() };
  });
}
