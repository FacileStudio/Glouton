import { compactVerify, decodeProtectedHeader, importJWK, type CryptoKey, type JWK, type KeyObject } from 'jose';
import { DefaultInterval, DirectoryUnavailableError, readCapped } from './registre-directory';

/**
 * TypeScript port of porte/directory v0.3.0's GDPR deletion receiver
 * (deletions.go, deletions_poll.go, deletions_state.go, secevent.go, keys.go).
 *
 * Registre lists the accounts it erased (GET /api/directory/deletions, kept 60
 * days) and may also push a signed `secevent+jwt` to DeletionsPath. Both paths
 * hand each person to `onPersonDeleted` once. A person counts as handled only
 * after the callback and `erase` both returned and the state was saved, so
 * delivery is at least once and the callback must be idempotent.
 *
 * Run exactly one process's `run()`: two would race on the state and could
 * each call the callback for the same person.
 */

/** The route the app mounts the handler on, and the deletion_uri to set in Registre. Never the sync route. */
export const DeletionsPath = '/api/registre/deletions';

/** The key Registre's deletion notice carries in `events`. */
export const UserDeletedEvent = 'https://schemas.facile.studio/event/user-deleted';

const MICROS = 1000n;
const SECOND = 1_000_000n;

/** Microseconds since the epoch: Registre's timestamps carry microseconds, a JS Date only milliseconds. */
type Micros = bigint;

/** How long Registre lists an erasure; the receiver keeps its own record of handled subjects for the same span. */
export const DeletionRetention: Micros = 60n * 24n * 3600n * SECOND;
const overlap: Micros = 60n * SECOND;
export const ListLimit = 1000;
const maxNoticeSize = 16 << 10;
const clockLeewaySeconds = 60;
const maxNoticeLifeSeconds = 3600;
const jwksRefetchGap = 60_000;
const maxKeyDocument = 1 << 20;
const secEventType = 'secevent+jwt';

const nowMicros = (): Micros => BigInt(Date.now()) * MICROS;

/** Parses an RFC 3339 timestamp, keeping the microseconds the Date constructor drops; null when malformed. */
export function parseMicros(value: string): Micros | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const base = Date.parse(`${match[1]}${match[3]}`);
  if (Number.isNaN(base)) return null;
  const fraction = BigInt((match[2] ?? '').padEnd(6, '0').slice(0, 6) || '0');
  return BigInt(base) * MICROS + fraction;
}

/** Formats microseconds as RFC 3339 in UTC with the fraction trimmed of trailing zeros, like Go's RFC3339Nano. */
export function formatMicros(value: Micros): string {
  const stamp = new Date(Number(value / SECOND) * 1000).toISOString().slice(0, 19);
  const fraction = (value % SECOND).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${stamp}.${fraction}Z` : `${stamp}Z`;
}

/** The persisted record: the newest erasure time handled in order, and every subject handled with the moment. */
export interface DeletionState {
  cursor: Micros;
  done: Map<string, Micros>;
}

interface StoredState {
  cursor: string;
  done: Record<string, string>;
}

const ZERO = '0001-01-01T00:00:00Z';

function encodeState(state: DeletionState): string {
  const stored: StoredState = {
    cursor: state.cursor === 0n ? ZERO : formatMicros(state.cursor),
    done: Object.fromEntries([...state.done].map(([sub, at]) => [sub, formatMicros(at)])),
  };
  return JSON.stringify(stored);
}

function decodeState(raw: string): DeletionState {
  const state: DeletionState = { cursor: 0n, done: new Map() };
  if (raw === '') return state;
  const stored = JSON.parse(raw) as Partial<StoredState>;
  if (typeof stored.cursor === 'string' && stored.cursor !== ZERO) {
    const cursor = parseMicros(stored.cursor);
    if (cursor === null) throw new Error('directory: decode the deletion state: bad cursor');
    state.cursor = cursor;
  }
  for (const [sub, at] of Object.entries(stored.done ?? {})) {
    const when = parseMicros(at);
    if (when === null) throw new Error('directory: decode the deletion state: bad timestamp');
    state.done.set(sub, when);
  }
  return state;
}

/** Persists the receiver's state as one text value. Load returns '' when nothing was saved yet. */
export interface StateStore {
  load(): Promise<string>;
  save(state: string): Promise<void>;
}

/** What the receiver needs from Registre: the erasure list, and who it is talking to. */
export interface DeletionSource {
  deletions(since: string): Promise<{ sub: string; deleted_at: string }[]>;
  readonly identity: { issuer: string; clientId: string };
}

export interface DeletionLogger {
  warn(object: unknown, message?: string): void;
}

export interface DeletionsConfig {
  client: DeletionSource;
  onPersonDeleted: (provider: string, subject: string) => Promise<void>;
  erase?: (provider: string, subject: string) => Promise<void>;
  state: StateStore;
  logger: DeletionLogger;
  interval?: number;
  fetchJson?: (url: string) => Promise<unknown>;
  now?: () => number;
}

const trimIssuer = (value: string) => value.replace(/\/$/, '');

class SameInstantError extends Error {
  constructor() {
    super(
      `directory: ${ListLimit} or more deletion notices share one timestamp, the rest cannot be listed`
    );
  }
}

interface PollResult {
  handled: Micros[];
  failed: Micros;
  errors: unknown[];
}

/** Serialises async work, like the Go receiver's mutex. */
class Mutex {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => (release = resolve));
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
}

type VerifyKey = CryptoKey | KeyObject | Uint8Array;

/**
 * The issuer's RSA signing keys, found through its discovery document and
 * refetched when a token names a kid it does not hold, at most once a minute
 * so a forged kid cannot make the app hammer Registre.
 */
class KeySet {
  private keys = new Map<string, VerifyKey>();
  private fetchedAt = 0;
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly issuer: string,
    private readonly getJson: (url: string) => Promise<unknown>,
    private readonly now: () => number
  ) {}

  async lookup(kid: string): Promise<VerifyKey> {
    const cached = this.keys.get(kid);
    if (cached) return cached;
    if (this.inflight) await this.inflight;
    else if (this.now() - this.fetchedAt < jwksRefetchGap && this.fetchedAt !== 0) {
      throw new DirectoryUnavailableError('unknown kid, keys fetched less than a minute ago');
    } else {
      this.inflight = this.refresh().finally(() => (this.inflight = null));
      await this.inflight;
    }
    const key = this.keys.get(kid);
    if (!key) throw new UnknownKeyError();
    return key;
  }

  private async refresh(): Promise<void> {
    try {
      this.keys = await this.fetchKeys();
    } finally {
      this.fetchedAt = this.now();
    }
  }

  private async fetchKeys(): Promise<Map<string, VerifyKey>> {
    const discovery = (await this.getJson(`${trimIssuer(this.issuer)}/.well-known/openid-configuration`)) as {
      issuer?: unknown;
      jwks_uri?: unknown;
    };
    if (typeof discovery.issuer !== 'string' || trimIssuer(discovery.issuer) !== trimIssuer(this.issuer)) {
      throw new DirectoryUnavailableError(`discovery names issuer ${String(discovery.issuer)}`);
    }
    const location = discovery.jwks_uri;
    if (typeof location !== 'string' || (!location.startsWith('https://') && !this.issuer.startsWith('http://'))) {
      throw new DirectoryUnavailableError(`jwks_uri ${String(location)} is not https`);
    }
    const document = (await this.getJson(location)) as { keys?: JWK[] };
    const keys = new Map<string, VerifyKey>();
    for (const jwk of Array.isArray(document.keys) ? document.keys : []) {
      if (jwk.kty !== 'RSA' || (jwk.use && jwk.use !== 'sig') || (jwk.alg && jwk.alg !== 'RS256') || !jwk.kid) continue;
      try {
        keys.set(jwk.kid, await importJWK({ ...jwk, alg: 'RS256' }, 'RS256'));
      } catch {
        continue;
      }
    }
    return keys;
  }
}

class UnknownKeyError extends Error {}

/** Reads a small unauthenticated JSON document without following redirects. */
async function getJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new DirectoryUnavailableError(error instanceof Error ? error.message : String(error));
  }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => {});
    throw new DirectoryUnavailableError(`${url} answered ${response.status}`);
  }
  try {
    return JSON.parse(await readCapped(response, maxKeyDocument));
  } catch (error) {
    throw new DirectoryUnavailableError(`read ${url}: ${String(error)}`);
  }
}

export class Deletions {
  private state: DeletionState | null = null;
  private readonly lock = new Mutex();
  private readonly keys: KeySet;
  private readonly interval: number;
  private readonly now: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly config: DeletionsConfig) {
    this.interval = config.interval ?? DefaultInterval;
    this.now = config.now ?? Date.now;
    this.keys = new KeySet(config.client.identity.issuer, config.fetchJson ?? getJson, this.now);
  }

  /** Polls at once, then every interval until `stop()`. A failed poll is logged and retried at the next tick. */
  run(): Promise<void> {
    this.timer ??= setInterval(() => void this.safePoll(), this.interval);
    return this.safePoll();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async safePoll(): Promise<void> {
    try {
      await this.poll();
    } catch (error) {
      this.config.logger.warn({ error }, 'directory: deletion poll failed, will retry');
    }
  }

  /**
   * Lists Registre's erasures since the saved cursor, page by page, and
   * handles each person. A person who fails does not block the others: the
   * rest of the page is still handled, the cursor never moves to or past the
   * earliest failure, and the errors come back together. The next poll lists
   * the failed person again and skips the ones already handled.
   */
  poll(): Promise<void> {
    return this.lock.run(async () => {
      const state = await this.load();
      const result = await this.drain(this.since(state));
      if (this.state === null) return this.raise(result.errors);
      const cursor = cursorAfter(result.handled, result.failed);
      if (cursor > state.cursor) {
        state.cursor = cursor;
        try {
          await this.persist();
        } catch (error) {
          result.errors.push(error);
        }
      }
      return this.raise(result.errors);
    });
  }

  private raise(errors: unknown[]): void {
    if (errors.length === 0) return;
    if (errors.length === 1) throw errors[0];
    throw new AggregateError(errors, errors.map(String).join('; '));
  }

  private since(state: DeletionState): Micros {
    return state.cursor === 0n ? nowMicros() - DeletionRetention : state.cursor - overlap;
  }

  private async drain(start: Micros): Promise<PollResult> {
    const result: PollResult = { handled: [], failed: 0n, errors: [] };
    let since = start;
    for (;;) {
      let list: { sub: string; deleted_at: string }[];
      try {
        list = await this.config.client.deletions(formatMicros(since));
      } catch (error) {
        result.errors.push(error);
        return result;
      }
      await this.handleAll(list, result);
      try {
        await this.persist();
      } catch (error) {
        result.errors.push(error);
        return result;
      }
      const next = nextPage(list, since);
      if (next.error) result.errors.push(next.error);
      if (!next.more) return result;
      since = next.since;
    }
  }

  private async handleAll(list: { sub: string; deleted_at: string }[], result: PollResult): Promise<void> {
    for (const person of list) {
      const at = parseMicros(person.deleted_at);
      try {
        if (at === null) throw new Error(`directory: bad deleted_at for ${person.sub}`);
        await this.handle(person.sub);
        result.handled.push(at);
      } catch (error) {
        result.errors.push(error);
        if (at !== null && (result.failed === 0n || at < result.failed)) result.failed = at;
      }
    }
  }

  /** Erases one person unless handled already and records it in memory; the caller saves and holds the lock. */
  private async handle(subject: string): Promise<void> {
    const state = await this.load();
    if (state.done.has(subject)) return;
    await this.erase(subject);
    const now = nowMicros();
    state.done.set(subject, now);
    for (const [done, when] of state.done) {
      if (now - when > DeletionRetention + overlap) state.done.delete(done);
    }
  }

  private async erase(subject: string): Promise<void> {
    const provider = this.config.client.identity.issuer;
    try {
      await this.config.onPersonDeleted(provider, subject);
    } catch (error) {
      throw new Error(`directory: erase ${subject}: ${String(error)}`, { cause: error });
    }
    if (!this.config.erase) return;
    try {
      await this.config.erase(provider, subject);
    } catch (error) {
      throw new Error(`directory: erase porte rows of ${subject}: ${String(error)}`, { cause: error });
    }
  }

  private async load(): Promise<DeletionState> {
    if (this.state) return this.state;
    let raw: string;
    try {
      raw = await this.config.state.load();
    } catch (error) {
      throw new Error(`directory: load the deletion state: ${String(error)}`, { cause: error });
    }
    this.state = decodeState(raw);
    return this.state;
  }

  /** Saves the state; on failure forgets the in-memory copy so the next call reloads what was last stored. */
  private async persist(): Promise<void> {
    if (!this.state) return;
    try {
      await this.config.state.save(encodeState(this.state));
    } catch (error) {
      this.state = null;
      throw new Error(`directory: save the deletion state: ${String(error)}`, { cause: error });
    }
  }

  /**
   * Accepts Registre's signed user.deleted push. 405 to anything but POST,
   * 400 to a notice that does not verify, 503 when the issuer's keys cannot be
   * fetched, 500 when erasing failed so Registre retries, 202 once the person
   * is erased or was already.
   */
  async handler(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    }
    let raw: string;
    try {
      raw = await readCapped(new Response(request.body), maxNoticeSize);
    } catch {
      return new Response(null, { status: 400 });
    }
    let subject: string;
    try {
      subject = await this.verify(raw.trim());
    } catch (error) {
      if (error instanceof DirectoryUnavailableError) return new Response(null, { status: 503 });
      return new Response(null, { status: 400 });
    }
    try {
      await this.lock.run(async () => {
        await this.handle(subject);
        await this.persist();
      });
    } catch (error) {
      this.config.logger.warn({ error }, 'directory: erase from a pushed notice failed');
      return new Response(null, { status: 500 });
    }
    return new Response(null, { status: 202 });
  }

  /**
   * Checks a compact JWS against everything the handler promises: typ
   * secevent+jwt, RS256 by a key in the issuer's JWKS, iss, aud holding the
   * client id, the time window, and the user-deleted event. Returns the subject.
   */
  private async verify(token: string): Promise<string> {
    const header = decodeProtectedHeader(token);
    if (header.alg !== 'RS256' || header.typ !== secEventType || typeof header.kid !== 'string') {
      throw new Error('directory: invalid deletion notice');
    }
    let key: VerifyKey;
    try {
      key = await this.keys.lookup(header.kid);
    } catch (error) {
      if (error instanceof DirectoryUnavailableError) throw error;
      throw new Error('directory: invalid deletion notice', { cause: error });
    }
    const { payload: bytes } = await compactVerify(token, key, { algorithms: ['RS256'] });
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    if (!this.acceptable(claims)) throw new Error('directory: invalid deletion notice');
    return claims.sub as string;
  }

  private acceptable(claims: Record<string, unknown>): boolean {
    const { issuer, clientId } = this.config.client.identity;
    const events = claims.events;
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const { iat, exp } = claims;
    const nowSeconds = Math.floor(this.now() / 1000);
    return (
      typeof events === 'object' &&
      events !== null &&
      UserDeletedEvent in events &&
      typeof claims.sub === 'string' &&
      claims.sub !== '' &&
      typeof claims.iss === 'string' &&
      trimIssuer(claims.iss) === issuer &&
      audience.includes(clientId) &&
      typeof iat === 'number' &&
      typeof exp === 'number' &&
      exp > nowSeconds - clockLeewaySeconds &&
      iat <= nowSeconds + clockLeewaySeconds &&
      exp - iat <= maxNoticeLifeSeconds
    );
  }
}

/** Where the following page starts, and whether there is one. A full page means more may follow. */
function nextPage(
  list: { deleted_at: string }[],
  since: Micros
): { since: Micros; more: boolean; error?: Error } {
  if (list.length < ListLimit) return { since, more: false };
  const last = parseMicros(list[list.length - 1]!.deleted_at);
  const next = last === null ? since : last - 1n;
  if (next <= since) return { since, more: false, error: new SameInstantError() };
  return { since: next, more: true };
}

/** The newest handled time strictly before the earliest failure (0n when none was handled). */
export function cursorAfter(handled: Micros[], failed: Micros): Micros {
  let cursor = 0n;
  for (const at of handled) {
    if ((failed === 0n || at < failed) && at > cursor) cursor = at;
  }
  return cursor;
}
