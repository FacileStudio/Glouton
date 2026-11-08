import { WebSearchError } from './types';
import { checkPublicUrl, UnsafeUrlError } from './url-guard';

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
  const names = Array.from(new Set(engines.map((name) => name.trim().toLowerCase()))).sort();
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

export function cleanUrls(urls: string[]): string[] {
  if (urls.length === 0 || urls.length > MAX_URLS) {
    throw new WebSearchError('invalid_input', `provide 1 to ${MAX_URLS} urls`);
  }
  return urls.map((raw) => {
    try {
      return checkPublicUrl(raw).toString();
    } catch (error) {
      if (error instanceof UnsafeUrlError) throw new WebSearchError('invalid_input', error.message);
      throw error;
    }
  });
}
