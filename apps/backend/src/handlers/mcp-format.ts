import { clip, decodeCursor, encodeCursor, encodedSize, failure, fitCount, invalid } from '@facile/tronc/mcp';

/** The deepest offset a list tool pages to; past it the model must narrow its query. */
export const MAX_OFFSET = 400;

/** How much of an email body or note a detailed result carries. */
export const BODY_LIMIT = 2000;

/** Turns a camelCase key into the snake_case tools speak. */
export const snakeKey = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Converts the keys of tool arguments, nested objects and arrays included, to camelCase. */
export function camel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camel);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), camel(v)]));
}

/** Converts the keys of a service row, nested objects and arrays included, to snake_case; dates become ISO strings. */
export function snake(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(snake);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [snakeKey(k), snake(v)]));
}

/** Keeps the listed keys of row. */
export function pick<T extends object, K extends keyof T>(row: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]])) as Pick<T, K>;
}

/** Cuts a long text for a detailed result. */
export function short(text: string | null | undefined): string | null {
  return text ? clip(text, BODY_LIMIT).text : null;
}

/** The offset a list cursor points at. */
export function offsetOf(cursor: string | undefined): number {
  const position = decodeCursor<{ offset?: unknown }>(cursor);
  const offset = typeof position?.offset === 'number' && Number.isInteger(position.offset) ? position.offset : 0;
  if (offset < 0 || offset > MAX_OFFSET) throw failure(invalid('the cursor is past the last page. Narrow the query instead'));
  return offset;
}

/**
 * Pages rows, fetched from the top up to one past offset + limit, into the
 * items that fit the result budget and the cursor of the next page.
 */
export function page<T>(rows: T[], offset: number, limit: number): { items: T[]; next_cursor?: string } {
  const window = rows.slice(offset, offset + limit);
  const fit = fitCount(window.length, (n) => encodedSize(window.slice(0, n)) + 200);
  const items = window.slice(0, Math.max(fit, Math.min(1, window.length)));
  const more = rows.length > offset + items.length;
  return more && offset + items.length <= MAX_OFFSET
    ? { items, next_cursor: encodeCursor({ offset: offset + items.length }) }
    : { items };
}

/** Drops the tail of list until value fits the result budget. */
export function fitList<T>(list: T[], wrap: (items: T[]) => unknown): T[] {
  return list.slice(0, fitCount(list.length, (n) => encodedSize(wrap(list.slice(0, n)))));
}
