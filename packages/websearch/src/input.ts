import { isIP } from 'node:net';
import { WebSearchError } from './types';

const MAX_QUERY_LENGTH = 400;
const MAX_URLS = 5;
const MAX_COUNT = 30;
const ENGINE_NAME = /^[a-z][a-z0-9]{1,23}$/;
const SELECTOR = /^[^\u0000-\u001f]{1,200}$/;

export function cleanQuery(raw: string): string {
  const query = raw.replace(/\s+/g, ' ').trim();
  if (query.length === 0) throw new WebSearchError('invalid_input', 'empty query');
  if (query.length > MAX_QUERY_LENGTH) throw new WebSearchError('invalid_input', 'query too long');
  return query;
}

export function cleanCount(count: number | undefined): number | undefined {
  if (count === undefined) return undefined;
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw new WebSearchError('invalid_input', `count must be an integer from 1 to ${MAX_COUNT}`);
  }
  return count;
}

export function cleanEngines(engines: string[] | undefined): string[] | undefined {
  if (!engines || engines.length === 0) return undefined;
  const names = [...new Set(engines.map((name) => name.trim().toLowerCase()))].sort();
  for (const name of names) {
    if (!ENGINE_NAME.test(name)) throw new WebSearchError('invalid_input', 'invalid engine name');
  }
  return names;
}

export function cleanSelector(selector: string | undefined): string | undefined {
  if (selector === undefined || selector === '') return undefined;
  if (!SELECTOR.test(selector)) throw new WebSearchError('invalid_input', 'invalid selector');
  return selector;
}

function isPrivateIPv4(host: string): boolean {
  const [a, b] = host.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isInternalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const family = isIP(host);
  if (family === 4) return isPrivateIPv4(host);
  if (family === 6) {
    return (
      host === '::1' ||
      host === '::' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80') ||
      host.startsWith('::ffff:')
    );
  }
  if (!host.includes('.')) return true;
  return host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost');
}

export function cleanUrls(urls: string[]): string[] {
  if (urls.length === 0 || urls.length > MAX_URLS) {
    throw new WebSearchError('invalid_input', `provide 1 to ${MAX_URLS} urls`);
  }
  return urls.map((raw) => {
    let parsed: URL;
    try {
      parsed = new URL(raw.trim());
    } catch {
      throw new WebSearchError('invalid_input', 'invalid url');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new WebSearchError('invalid_input', 'only http and https urls are allowed');
    }
    if (parsed.username || parsed.password) {
      throw new WebSearchError('invalid_input', 'urls with credentials are not allowed');
    }
    if (isInternalHost(parsed.hostname)) {
      throw new WebSearchError('invalid_input', 'internal hosts are not allowed');
    }
    return parsed.toString();
  });
}
