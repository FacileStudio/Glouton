export const COURRIER_AUDIENCE = 'tniN7PWx8mSOCwVAAvYpBexYnMFWAM5flt19rNl0';
export const COURRIER_SCOPES = 'courrier.read courrier.write';
export const RECONNECT_MESSAGE = 'Reconnect your Facile account';

const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';
const EXPIRY_MARGIN_MS = 30_000;
const FALLBACK_LIFETIME_MS = 60_000;

/** Thrown when Glouton holds no usable Registre grant for the user: they must sign in again. */
export class CourrierReconnectError extends Error {
  constructor(readonly detail?: string) {
    super(RECONNECT_MESSAGE);
    this.name = 'CourrierReconnectError';
  }
}

/** Thrown when Registre or Courrier answers with an error other than a lost grant. */
export class CourrierError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'CourrierError';
  }
}

/** Where the user's Registre refresh token lives; Registre rotates it on every refresh. */
export interface RefreshTokenStore {
  load(userId: string): Promise<string | null>;
  save(userId: string, refreshToken: string): Promise<void>;
}

export interface CourrierConfig {
  courrierUrl: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  audience?: string;
  store: RefreshTokenStore;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface CourrierAccount {
  id: number;
  name: string;
  email: string;
  isDefault: boolean;
}

export interface CourrierMail {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

export interface CourrierMessage {
  id: number;
  messageId: string;
  fromAddress: string;
  subject: string;
  date: Date;
}

export interface CourrierContact {
  email: string;
  name: string;
  sentCount: number;
  lastSentAt: Date | null;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

type Json = Record<string, unknown>;

function record(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function jwtExpiry(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const exp = record(JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  const root = record(body);
  const nested = record(root.error);
  return text(nested.message) || text(root.error_description) || text(root.error) || text(root.message) || fallback;
}

async function readJson(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Talks to Courrier as a Glouton user. Each call turns the user's stored
 * Registre refresh token into a Registre access token, exchanges that
 * (RFC 8693) for a Courrier token, and caches both per user until 30 seconds
 * before they expire. Concurrent calls for one user share a single refresh, so
 * Registre's refresh-token rotation never sees the same grant twice.
 */
export class CourrierClient {
  private readonly baseUrl: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly http: typeof fetch;
  private readonly now: () => number;
  private readonly registreTokens = new Map<string, CachedToken>();
  private readonly courrierTokens = new Map<string, CachedToken>();
  private readonly pending = new Map<string, Promise<string>>();
  private tokenEndpoint: string | null = null;

  constructor(private readonly config: CourrierConfig) {
    this.baseUrl = config.courrierUrl.replace(/\/$/, '');
    this.issuer = config.issuer.replace(/\/$/, '');
    this.audience = config.audience ?? COURRIER_AUDIENCE;
    this.http = config.fetch ?? fetch;
    this.now = config.now ?? Date.now;
  }

  /** Lists the mail accounts the user can send from, narrowed to a Registre space when given. */
  async listAccounts(userId: string, spaceId?: string | null): Promise<CourrierAccount[]> {
    const query = spaceId ? `?space_id=${encodeURIComponent(spaceId)}` : '';
    const body = record(await this.request(userId, 'GET', `/accounts${query}`));
    return list(body.accounts).map((item) => {
      const row = record(item);
      return {
        id: Number(row.id),
        name: text(row.name),
        email: text(row.email),
        isDefault: row.is_default === true,
      };
    });
  }

  /** Sends one mail through a Courrier account, which files it in that account's Sent folder. */
  async send(userId: string, accountId: number, mail: CourrierMail): Promise<void> {
    await this.request(userId, 'POST', `/accounts/${accountId}/mail/send`, {
      to: mail.to,
      subject: mail.subject,
      body: mail.text,
      body_html: mail.html ?? '',
    });
  }

  /** Mail received on an account from one address after a moment, oldest first. */
  async searchFrom(userId: string, accountId: number, email: string, since: Date): Promise<CourrierMessage[]> {
    const wanted = email.trim().toLowerCase();
    const query = new URLSearchParams({ q: wanted, limit: '100' });
    const body = record(await this.request(userId, 'GET', `/accounts/${accountId}/mail/search?${query}`));
    return list(body.emails)
      .map((item) => {
        const row = record(item);
        return {
          id: Number(row.id),
          messageId: text(row.message_id),
          fromAddress: text(row.from_address).trim().toLowerCase(),
          subject: text(row.subject),
          date: new Date(text(row.date)),
        };
      })
      .filter((m) => m.fromAddress === wanted && !Number.isNaN(m.date.getTime()) && m.date > since)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /** Every address the user wrote to from any Courrier account, up to `maxPages` pages of 100. */
  async listContacts(userId: string, maxPages = 20): Promise<CourrierContact[]> {
    const contacts: CourrierContact[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const body = record(await this.request(userId, 'GET', `/mail/contacts?page=${page}&limit=100`));
      const rows = list(body.contacts).map((item) => {
        const row = record(item);
        const last = new Date(text(row.last_sent_at));
        return {
          email: text(row.email).trim().toLowerCase(),
          name: text(row.name).trim(),
          sentCount: Number(row.sent_count) || 0,
          lastSentAt: Number.isNaN(last.getTime()) ? null : last,
        };
      });
      contacts.push(...rows.filter((c) => c.email));
      const total = Number(body.total) || 0;
      if (rows.length < 100 || page * 100 >= total) break;
    }
    return contacts;
  }

  /** A Courrier access token for the user, minted through Registre when the cached one is stale. */
  async courrierToken(userId: string): Promise<string> {
    const cached = this.fresh(this.courrierTokens, userId);
    if (cached) return cached;
    const running = this.pending.get(userId);
    if (running) return running;
    const minting = this.mintCourrierToken(userId).finally(() => this.pending.delete(userId));
    this.pending.set(userId, minting);
    return minting;
  }

  /** Drops every cached token for the user, so the next call goes back to Registre. */
  forget(userId: string): void {
    this.registreTokens.delete(userId);
    this.courrierTokens.delete(userId);
  }

  private fresh(cache: Map<string, CachedToken>, userId: string): string | null {
    const entry = cache.get(userId);
    if (entry && entry.expiresAt > this.now()) return entry.value;
    cache.delete(userId);
    return null;
  }

  private remember(cache: Map<string, CachedToken>, userId: string, token: string, expiresIn?: number): void {
    const expiry =
      typeof expiresIn === 'number' && expiresIn > 0
        ? this.now() + expiresIn * 1000
        : (jwtExpiry(token) ?? this.now() + FALLBACK_LIFETIME_MS);
    cache.set(userId, { value: token, expiresAt: expiry - EXPIRY_MARGIN_MS });
  }

  private async mintCourrierToken(userId: string): Promise<string> {
    const reused = this.fresh(this.registreTokens, userId);
    try {
      return await this.exchange(userId, reused ?? (await this.refresh(userId)));
    } catch (error) {
      if (!reused || error instanceof CourrierReconnectError) throw error;
      this.registreTokens.delete(userId);
      return this.exchange(userId, await this.refresh(userId));
    }
  }

  private async endpoint(): Promise<string> {
    if (this.tokenEndpoint) return this.tokenEndpoint;
    const response = await this.http(`${this.issuer}/.well-known/openid-configuration`);
    if (!response.ok) throw new CourrierError(`Registre discovery failed (${response.status})`, response.status);
    const endpoint = text(record(await readJson(response)).token_endpoint);
    if (!endpoint) throw new CourrierError('Registre discovery has no token endpoint', 502);
    this.tokenEndpoint = endpoint;
    return endpoint;
  }

  private async tokenRequest(form: Record<string, string>): Promise<{ status: number; body: TokenResponse }> {
    const basic = btoa(`${encodeURIComponent(this.config.clientId)}:${encodeURIComponent(this.config.clientSecret)}`);
    const response = await this.http(await this.endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
      body: new URLSearchParams(form),
    });
    return { status: response.status, body: record(await readJson(response)) as TokenResponse };
  }

  private async refresh(userId: string): Promise<string> {
    const refreshToken = await this.config.store.load(userId);
    if (!refreshToken) throw new CourrierReconnectError('no refresh token stored');
    const { status, body } = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
    if (body.refresh_token && body.refresh_token !== refreshToken) {
      await this.config.store.save(userId, body.refresh_token);
    }
    if (status >= 400 || !body.access_token) {
      if (body.error === 'invalid_grant' || status === 400 || status === 401) {
        throw new CourrierReconnectError(body.error_description ?? body.error);
      }
      throw new CourrierError(`Registre refused the refresh (${status})`, status);
    }
    this.remember(this.registreTokens, userId, body.access_token, body.expires_in);
    return body.access_token;
  }

  private async exchange(userId: string, subjectToken: string): Promise<string> {
    const { status, body } = await this.tokenRequest({
      grant_type: TOKEN_EXCHANGE_GRANT,
      subject_token: subjectToken,
      subject_token_type: ACCESS_TOKEN_TYPE,
      audience: this.audience,
      scope: COURRIER_SCOPES,
    });
    if (status >= 400 || !body.access_token) {
      throw new CourrierError(
        `Registre refused the Courrier token exchange: ${body.error_description ?? body.error ?? status}`,
        status
      );
    }
    this.remember(this.courrierTokens, userId, body.access_token, body.expires_in);
    return body.access_token;
  }

  private async request(userId: string, method: string, path: string, payload?: unknown): Promise<unknown> {
    const call = async (token: string) =>
      this.http(`${this.baseUrl}/api${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
    let response = await call(await this.courrierToken(userId));
    if (response.status === 401) {
      this.forget(userId);
      response = await call(await this.courrierToken(userId));
    }
    const body = await readJson(response);
    if (!response.ok) {
      throw new CourrierError(`Courrier: ${errorMessage(body, response.statusText || String(response.status))}`, response.status);
    }
    return body;
  }
}
