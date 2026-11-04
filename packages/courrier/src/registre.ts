export const RECONNECT_MESSAGE = 'Reconnect your Facile account';

const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';
const EXPIRY_MARGIN_MS = 30_000;
const FALLBACK_LIFETIME_MS = 60_000;

/** Thrown when Glouton holds no usable Registre grant for the user: they must sign in again. */
export class RegistreReconnectError extends Error {
  constructor(readonly detail?: string) {
    super(RECONNECT_MESSAGE);
    this.name = 'RegistreReconnectError';
  }
}

/** Thrown when Registre or a downstream app answers with an error other than a lost grant. */
export class RegistreError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'RegistreError';
  }
}

/** Where the user's Registre refresh token lives; Registre rotates it on every refresh. */
export interface RefreshTokenStore {
  load(userId: string): Promise<string | null>;
  save(userId: string, refreshToken: string): Promise<void>;
}

export interface RegistreConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  store: RefreshTokenStore;
  fetch?: typeof fetch;
  now?: () => number;
}

/** One downstream app a Registre access token is exchanged for (RFC 8693). */
export interface ExchangeTarget {
  audience: string;
  scopes: string;
  label: string;
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

/** The value as a plain object, or an empty one. */
export function record(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

/** The value when it is a string, else an empty string. */
export function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The response body as JSON, as raw text when it is not JSON, or null when empty. */
export async function readJson(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
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

/**
 * Mints downstream tokens for a Glouton user. The user's stored Registre
 * refresh token becomes a Registre access token, which is exchanged (RFC 8693)
 * for each target audience; both are cached per user until 30 seconds before
 * they expire. Registre rotates the refresh token on every refresh, so one
 * instance must serve every audience: refreshes for one user are serialized
 * across all of them and the rotated token is persisted each time.
 */
export class RegistreTokens {
  private readonly issuer: string;
  private readonly http: typeof fetch;
  private readonly now: () => number;
  private readonly registreTokens = new Map<string, CachedToken>();
  private readonly exchanged = new Map<string, CachedToken>();
  private readonly pendingMints = new Map<string, Promise<string>>();
  private readonly pendingRefreshes = new Map<string, Promise<string>>();
  private tokenEndpoint: string | null = null;

  constructor(private readonly config: RegistreConfig) {
    this.issuer = config.issuer.replace(/\/$/, '');
    this.http = config.fetch ?? fetch;
    this.now = config.now ?? Date.now;
  }

  /** An access token for the target app, minted through Registre when the cached one is stale. */
  async token(userId: string, target: ExchangeTarget): Promise<string> {
    const key = `${target.audience}\n${userId}`;
    const cached = this.fresh(this.exchanged, key);
    if (cached) return cached;
    const running = this.pendingMints.get(key);
    if (running) return running;
    const minting = this.mint(userId, key, target).finally(() => this.pendingMints.delete(key));
    this.pendingMints.set(key, minting);
    return minting;
  }

  /** Drops the user's Registre token and the target's token, so the next call goes back to Registre. */
  forget(userId: string, target: ExchangeTarget): void {
    this.registreTokens.delete(userId);
    this.exchanged.delete(`${target.audience}\n${userId}`);
  }

  private fresh(cache: Map<string, CachedToken>, key: string): string | null {
    const entry = cache.get(key);
    if (entry && entry.expiresAt > this.now()) return entry.value;
    cache.delete(key);
    return null;
  }

  private remember(cache: Map<string, CachedToken>, key: string, token: string, expiresIn?: number): void {
    const expiry =
      typeof expiresIn === 'number' && expiresIn > 0
        ? this.now() + expiresIn * 1000
        : (jwtExpiry(token) ?? this.now() + FALLBACK_LIFETIME_MS);
    cache.set(key, { value: token, expiresAt: expiry - EXPIRY_MARGIN_MS });
  }

  private async mint(userId: string, key: string, target: ExchangeTarget): Promise<string> {
    const reused = this.fresh(this.registreTokens, userId);
    try {
      return await this.exchange(key, reused ?? (await this.refresh(userId)), target);
    } catch (error) {
      if (!reused || error instanceof RegistreReconnectError) throw error;
      this.registreTokens.delete(userId);
      return this.exchange(key, await this.refresh(userId), target);
    }
  }

  private async endpoint(): Promise<string> {
    if (this.tokenEndpoint) return this.tokenEndpoint;
    const response = await this.http(`${this.issuer}/.well-known/openid-configuration`);
    if (!response.ok) throw new RegistreError(`Registre discovery failed (${response.status})`, response.status);
    const endpoint = text(record(await readJson(response)).token_endpoint);
    if (!endpoint) throw new RegistreError('Registre discovery has no token endpoint', 502);
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

  private refresh(userId: string): Promise<string> {
    const running = this.pendingRefreshes.get(userId);
    if (running) return running;
    const refreshing = this.doRefresh(userId).finally(() => this.pendingRefreshes.delete(userId));
    this.pendingRefreshes.set(userId, refreshing);
    return refreshing;
  }

  private async doRefresh(userId: string): Promise<string> {
    const refreshToken = await this.config.store.load(userId);
    if (!refreshToken) throw new RegistreReconnectError('no refresh token stored');
    const { status, body } = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
    if (body.refresh_token && body.refresh_token !== refreshToken) {
      await this.config.store.save(userId, body.refresh_token);
    }
    if (status >= 400 || !body.access_token) {
      if (body.error === 'invalid_grant' || status === 400 || status === 401) {
        throw new RegistreReconnectError(body.error_description ?? body.error);
      }
      throw new RegistreError(`Registre refused the refresh (${status})`, status);
    }
    this.remember(this.registreTokens, userId, body.access_token, body.expires_in);
    return body.access_token;
  }

  private async exchange(key: string, subjectToken: string, target: ExchangeTarget): Promise<string> {
    const { status, body } = await this.tokenRequest({
      grant_type: TOKEN_EXCHANGE_GRANT,
      subject_token: subjectToken,
      subject_token_type: ACCESS_TOKEN_TYPE,
      audience: target.audience,
      scope: target.scopes,
    });
    if (status >= 400 || !body.access_token) {
      throw new RegistreError(
        `Registre refused the ${target.label} token exchange: ${body.error_description ?? body.error ?? status}`,
        status
      );
    }
    this.remember(this.exchanged, key, body.access_token, body.expires_in);
    return body.access_token;
  }
}
