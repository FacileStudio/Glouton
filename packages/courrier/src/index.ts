import {
  RegistreError,
  RegistreReconnectError,
  RegistreTokens,
  readJson,
  record,
  text,
  type ExchangeTarget,
  type RefreshTokenStore,
} from './registre';

export {
  RECONNECT_MESSAGE,
  RegistreError,
  RegistreReconnectError,
  RegistreTokens,
  type ExchangeTarget,
  type RefreshTokenStore,
  type RegistreConfig,
} from './registre';

export const COURRIER_AUDIENCE = 'tniN7PWx8mSOCwVAAvYpBexYnMFWAM5flt19rNl0';
export const COURRIER_SCOPES = 'courrier.read courrier.write';

/** Thrown when Glouton holds no usable Registre grant for the user: they must sign in again. */
export const CourrierReconnectError = RegistreReconnectError;
export type CourrierReconnectError = RegistreReconnectError;

/** Thrown when Registre or Courrier answers with an error other than a lost grant. */
export const CourrierError = RegistreError;
export type CourrierError = RegistreError;

interface CourrierBase {
  courrierUrl: string;
  audience?: string;
  fetch?: typeof fetch;
}

/** Either a shared RegistreTokens (so every audience rotates one refresh token), or the settings to build one. */
export type CourrierConfig = CourrierBase &
  (
    | { registre: RegistreTokens }
    | { issuer: string; clientId: string; clientSecret: string; store: RefreshTokenStore; now?: () => number }
  );

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

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function errorMessage(body: unknown, fallback: string): string {
  const root = record(body);
  const nested = record(root.error);
  return text(nested.message) || text(root.error_description) || text(root.error) || text(root.message) || fallback;
}

/**
 * Talks to Courrier as a Glouton user, with a Courrier token minted by
 * RegistreTokens (refresh, then RFC 8693 exchange, cached per user). Pass the
 * shared RegistreTokens when other audiences are minted for the same users.
 */
export class CourrierClient {
  private readonly baseUrl: string;
  private readonly http: typeof fetch;
  private readonly registre: RegistreTokens;
  private readonly target: ExchangeTarget;

  constructor(config: CourrierConfig) {
    this.baseUrl = config.courrierUrl.replace(/\/$/, '');
    this.http = config.fetch ?? fetch;
    this.registre = 'registre' in config ? config.registre : new RegistreTokens(config);
    this.target = { audience: config.audience ?? COURRIER_AUDIENCE, scopes: COURRIER_SCOPES, label: 'Courrier' };
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
  courrierToken(userId: string): Promise<string> {
    return this.registre.token(userId, this.target);
  }

  /** Drops every cached token for the user, so the next call goes back to Registre. */
  forget(userId: string): void {
    this.registre.forget(userId, this.target);
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
