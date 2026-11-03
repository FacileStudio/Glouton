import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ServerEnv } from '@repo/env';

const REQUEST_TIMEOUT_MS = 10_000;
const ROUTES_PREFIX = '/api/integrations/glouton';

export const WEBHOOK_PATH = '/api/integrations/ardoise/webhook';
export const EVENT_HEADER = 'X-Ardoise-Event';
export const DELIVERY_HEADER = 'X-Ardoise-Delivery';
export const SIGNATURE_HEADER = 'X-Ardoise-Signature-256';
export const SYNC_SOURCE_HEADER = 'X-Sync-Source';
export const SYNC_SOURCE = 'glouton';

export interface ArdoiseConfig {
  url: string;
  token: string;
  webhookSecret: string;
  defaultOwnerEmail: string;
  webUrl: string;
}

export type ArdoiseEnv = Partial<
  Pick<
    ServerEnv,
    'ARDOISE_URL' | 'ARDOISE_API_TOKEN' | 'ARDOISE_WEBHOOK_SECRET' | 'ARDOISE_DEFAULT_OWNER_EMAIL' | 'ARDOISE_WEB_URL'
  >
>;

/** The payload both apps exchange for one Ardoise client, as Ardoise's packages/glouton defines it. */
export interface ClientPayload {
  id?: string;
  gloutonCompanyId: string | null;
  registreSpaceId: string | null;
  companyName: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string | null;
  billingAddress: string | null;
  billingCity: string | null;
  billingPostalCode: string | null;
  billingCountry: string | null;
  siret: string | null;
  tvaIntracom: string | null;
  updatedAt: string;
  actorEmail?: string;
}

export type OutboundClientPayload = ClientPayload & { gloutonCompanyId: string };
export type RemoteClient = ClientPayload & { id: string };

export interface WriteResult {
  id: string;
  updatedAt: string;
  skipped?: boolean;
}

export const DEFAULT_ARDOISE_WEB_URL = 'https://ardoise.facile.studio';

/** Reads the Ardoise settings; null unless all four required variables are set. */
export function ardoiseConfigFromEnv(env: ArdoiseEnv): ArdoiseConfig | null {
  if (!env.ARDOISE_URL || !env.ARDOISE_API_TOKEN || !env.ARDOISE_WEBHOOK_SECRET || !env.ARDOISE_DEFAULT_OWNER_EMAIL) {
    return null;
  }
  return {
    url: env.ARDOISE_URL.replace(/\/$/, ''),
    token: env.ARDOISE_API_TOKEN,
    webhookSecret: env.ARDOISE_WEBHOOK_SECRET,
    defaultOwnerEmail: env.ARDOISE_DEFAULT_OWNER_EMAIL,
    webUrl: (env.ARDOISE_WEB_URL ?? DEFAULT_ARDOISE_WEB_URL).replace(/\/$/, ''),
  };
}

/** The Ardoise web page of one client. */
export function ardoiseClientUrl(webUrl: string, ardoiseClientId: string): string {
  return `${webUrl.replace(/\/$/, '')}/admin/clients/${encodeURIComponent(ardoiseClientId)}`;
}

export function signBody(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

/** Checks an `X-Ardoise-Signature-256` header against the raw body in constant time. */
export function verifySignature(secret: string, body: string, header: string | null | undefined): boolean {
  if (!header) return false;
  const expected = Buffer.from(signBody(secret, body));
  const given = Buffer.from(header.trim());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** An error answer from Ardoise, keeping its HTTP status and `error.code`. */
export class ArdoiseError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ArdoiseError';
  }
}

type Envelope<T> = { data?: T; error?: { code?: string; message?: string } };

/** Calls Ardoise's /api/integrations/glouton routes with the shared bearer token. */
export function createArdoiseClient(config: Pick<ArdoiseConfig, 'url' | 'token'>, fetchImpl: typeof fetch = fetch) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetchImpl(`${config.url}${ROUTES_PREFIX}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/json',
        [SYNC_SOURCE_HEADER]: SYNC_SOURCE,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await response.json().catch(() => null)) as Envelope<T> | null;
    if (!response.ok || !json || json.data === undefined) {
      throw new ArdoiseError(
        response.status,
        json?.error?.code ?? 'http_error',
        json?.error?.message ?? `Ardoise answered ${response.status}`
      );
    }
    return json.data;
  }

  const client = (id: string) => `/clients/${encodeURIComponent(id)}`;

  return {
    upsert: (payload: OutboundClientPayload) => request<WriteResult>('POST', '/clients', payload),
    update: (id: string, payload: OutboundClientPayload) => request<WriteResult>('PUT', client(id), payload),
    unlink: (id: string) => request<WriteResult>('POST', `${client(id)}/unlink`),
    get: (id: string) => request<RemoteClient>('GET', client(id)),
  };
}

export type ArdoiseApi = ReturnType<typeof createArdoiseClient>;
