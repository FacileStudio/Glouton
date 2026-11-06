/**
 * TypeScript port of github.com/FacileStudio/porte/directory@v0.1.0, the
 * client every Facile app uses to keep its shared spaces equal to Registre's.
 *
 * Registre owns spaces, members and roles. The app pulls the whole snapshot
 * (at boot, every five minutes, and two seconds after a nudge) and applies it
 * idempotently, so a lost, repeated or reordered nudge costs nothing.
 */

/** Registre's three ranks, lowest to highest. */
export const RoleMember = 'member';
export const RoleAdmin = 'admin';
export const RoleOwner = 'owner';

/** The route Registre posts its empty nudge to, fixed across the suite. */
export const SyncPath = '/api/registre/sync';

/** How often a Syncer pulls without being nudged. */
export const DefaultInterval = 5 * 60 * 1000;

/** The shortest gap a burst of nudges collapses into before one pull. */
const debounce = 2 * 1000;

/** One person in a space, keyed by their Registre `sub`. */
export interface DirectoryMember {
  sub: string;
  email: string;
  name: string;
  picture: string;
  role: string;
}

/**
 * A scope's plan entitlements as Registre pushes them: each value is a JSON
 * bool or an integer limit where -1 means unlimited. Absent or `{}` means no
 * value was pushed for that scope yet.
 */
export type DirectoryEntitlements = Record<string, unknown>;

/** One shared space; `id` is Registre's and survives renames. */
export interface DirectorySpace {
  id: string;
  name: string;
  members: DirectoryMember[];
  entitlements?: DirectoryEntitlements;
}

/** One person's own entitlements, used for their personal scope, keyed by Registre `sub`. */
export interface DirectoryPerson {
  sub: string;
  entitlements?: DirectoryEntitlements;
}

/** Every shared space as Registre holds it now; `version` rises on every change. */
export interface Snapshot {
  version: number;
  spaces: DirectorySpace[];
  people?: DirectoryPerson[];
  /** The revision of the last entitlements push Registre applied; absent or 0 until the first one. */
  entitlements_revision?: number;
}

/** The largest snapshot body Glouton reads. */
export const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;

/** One person an app already had in a space before Registre owned spaces. */
export interface ImportMember {
  sub?: string;
  email?: string;
  role: string;
}

/** One shared space an app held before Registre owned spaces. */
export interface ImportSpace {
  name: string;
  members: ImportMember[];
}

/** Wraps every failure to reach Registre or read its answer. */
export class DirectoryUnavailableError extends Error {
  constructor(message: string) {
    super(`directory: registre unavailable: ${message}`);
    this.name = 'DirectoryUnavailableError';
  }
}

/** What a Syncer needs from a client, so tests can fake Registre. */
export interface SnapshotSource {
  snapshot(): Promise<Snapshot>;
}

/**
 * Refuses an issuer that would send the client secret in clear: outside
 * development it must be https. Development is any NODE_ENV but production.
 */
export function assertSecureIssuer(issuer: string, production = process.env.NODE_ENV === 'production'): void {
  if (production && new URL(issuer).protocol !== 'https:') {
    throw new Error('directory: OIDC_ISSUER must be https in production');
  }
}

/** Reads a response body, aborting as soon as it passes `max` bytes instead of buffering it whole. */
export async function readCapped(response: Response, max: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new Error(`more than ${max} bytes`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Talks to Registre's directory API with the app's own OIDC client
 * credentials over HTTP Basic, exactly like the Go client. Redirects are
 * refused, so the credentials only ever go to the configured issuer.
 */
export class DirectoryClient implements SnapshotSource {
  constructor(
    private readonly issuer: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly timeoutMs = 10_000
  ) {
    assertSecureIssuer(issuer);
  }

  /** Fetches every shared space as Registre holds it now. */
  snapshot(): Promise<Snapshot> {
    return this.call('GET', '/api/directory/snapshot');
  }

  /**
   * Hands Registre this app's pre-existing shared spaces. Registre merges them
   * by name, keeps the highest role, and remembers the import, so a second
   * call is a no-op answering the current snapshot.
   */
  import(spaces: ImportSpace[]): Promise<Snapshot> {
    return this.call('POST', '/api/directory/import', JSON.stringify({ spaces }));
  }

  /** Sends one authenticated request and decodes the snapshot it answers. */
  private async call(method: string, path: string, body?: string): Promise<Snapshot> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    let response: Response;
    try {
      response = await fetch(`${this.issuer.replace(/\/$/, '')}${path}`, {
        method,
        body,
        headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
      });
    } catch (error) {
      throw new DirectoryUnavailableError(error instanceof Error ? error.message : String(error));
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      throw new DirectoryUnavailableError(`${path} answered ${response.status}`);
    }
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_SNAPSHOT_BYTES) {
      await response.body?.cancel().catch(() => {});
      throw new DirectoryUnavailableError(`${path} answered more than ${MAX_SNAPSHOT_BYTES} bytes`);
    }
    try {
      return decodeSnapshot(JSON.parse(await readCapped(response, MAX_SNAPSHOT_BYTES)));
    } catch (error) {
      throw new DirectoryUnavailableError(`decode the snapshot: ${String(error)}`);
    }
  }
}

/** True for a plain JSON object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Reads a snapshot counter: absent is undefined, anything but a non-negative
 * safe integer rejects the whole snapshot, so a garbled version or revision
 * can never pass the stale checks.
 */
function counter(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  throw new Error(`snapshot ${name} is not a non-negative integer`);
}

/**
 * Turns a decoded body into a snapshot, dropping malformed entries: spaces
 * without a string id and people without a string `sub`. Entitlement maps
 * that are not objects are dropped too; their values are validated on read.
 * A version or revision that is not a non-negative integer throws.
 */
export function decodeSnapshot(raw: unknown): Snapshot {
  const body = isObject(raw) ? raw : {};
  const spaces = (Array.isArray(body.spaces) ? body.spaces : []).filter(
    (space): space is DirectorySpace => isObject(space) && typeof space.id === 'string'
  );
  const snapshot: Snapshot = {
    version: counter(body.version, 'version') ?? 0,
    spaces: spaces.map((space) => ({
      ...space,
      members: Array.isArray(space.members) ? space.members : [],
      entitlements: isObject(space.entitlements) ? space.entitlements : undefined,
    })),
  };
  const revision = counter(body.entitlements_revision, 'entitlements_revision');
  if (revision) snapshot.entitlements_revision = revision;
  if (Array.isArray(body.people)) {
    snapshot.people = body.people
      .filter((person): person is DirectoryPerson => isObject(person) && typeof person.sub === 'string' && person.sub !== '')
      .map((person) => ({
        sub: person.sub,
        entitlements: isObject(person.entitlements) ? person.entitlements : undefined,
      }));
  }
  return snapshot;
}

/** Minimal logger shape, satisfied by the app's pino logger. */
export interface SyncLogger {
  warn(object: unknown, message?: string): void;
}

/**
 * Keeps the app's spaces equal to Registre's. `apply` must be idempotent:
 * it runs again whenever anything may have changed. Pulls are serialised, a
 * burst of nudges collapses into one pull two seconds after the first, and a
 * snapshot whose version was already applied is skipped.
 */
export class Syncer {
  private applied = 0;
  private queue: Promise<void> = Promise.resolve();
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly source: SnapshotSource,
    private readonly apply: (snapshot: Snapshot) => Promise<void>,
    private readonly logger: SyncLogger,
    private readonly interval = DefaultInterval
  ) {}

  /** Pulls once now, then on every interval tick and after every nudge. */
  run(): Promise<void> {
    this.ticker ??= setInterval(() => void this.pull(), this.interval);
    return this.pull();
  }

  /** Stops the interval and any pending nudge. */
  stop(): void {
    if (this.ticker) clearInterval(this.ticker);
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.ticker = null;
    this.nudgeTimer = null;
  }

  /**
   * Schedules a pull; nudges arriving while one is pending collapse into it.
   * A nudge before `run` is dropped, because `run` pulls first anyway and the
   * caller may still be importing.
   */
  nudge(): void {
    if (!this.ticker || this.nudgeTimer) return;
    this.nudgeTimer = setTimeout(() => {
      this.nudgeTimer = null;
      void this.pull();
    }, debounce);
  }

  /** Pulls and applies once, skipping a version already applied. */
  async sync(): Promise<void> {
    const snapshot = await this.source.snapshot();
    if (snapshot.version !== 0 && snapshot.version === this.applied) return;
    await this.apply(snapshot);
    this.applied = snapshot.version;
  }

  /** Queues one sync behind any running one and logs its failure. */
  private pull(): Promise<void> {
    this.queue = this.queue.then(() =>
      this.sync().catch((error) =>
        this.logger.warn({ error }, '[REGISTRE] Directory sync failed, keeping the last applied spaces')
      )
    );
    return this.queue;
  }
}
