import {
  RegistreReconnectError,
  readJson,
  record,
  text,
  type ExchangeTarget,
  type RegistreTokens,
} from '@repo/courrier';
import { logger } from '@repo/logger';

export const BULLE_TARGET: ExchangeTarget = { audience: 'bulle', scopes: 'bulle.read bulle.write', label: 'Bulle' };

const ANTHROPIC_VERSION = '2023-06-01';
const READ_TIMEOUT_MS = 10_000;
const CHAT_TIMEOUT_MS = 90_000;

/** Why Bulle cannot answer: no Registre grant, no model key, Bulle down, or a backend Glouton cannot speak. */
export type BulleFailure = 'not_linked' | 'no_key' | 'unreachable' | 'unsupported';

/** Thrown by BulleClient for every failure, tagged with the reason the UI shows. */
export class BulleUnavailableError extends Error {
  constructor(
    readonly reason: BulleFailure,
    message: string
  ) {
    super(message);
    this.name = 'BulleUnavailableError';
  }
}

/** The model setup Bulle offers this user, persona included. */
export interface BulleOffer {
  backend: string;
  model: string;
  models: string[];
  persona: string;
}

export interface BulleProfile {
  name: string;
  avatarUrl: string | null;
}

export interface ChatPrompt {
  system: string;
  user: string;
  maxTokens: number;
}

export interface BulleConfig {
  bulleUrl: string;
  tokens: RegistreTokens;
  fetch?: typeof fetch;
}

type Json = Record<string, unknown>;

function chatRequest(offer: BulleOffer, model: string, prompt: ChatPrompt): { path: string; body: Json; headers: Json } {
  if (offer.backend === 'anthropic') {
    return {
      path: 'v1/messages',
      headers: { 'anthropic-version': ANTHROPIC_VERSION },
      body: {
        model,
        max_tokens: prompt.maxTokens,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      },
    };
  }
  if (offer.backend === 'openai' || offer.backend === 'openrouter') {
    return {
      path: 'chat/completions',
      headers: {},
      body: {
        model,
        max_tokens: prompt.maxTokens,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      },
    };
  }
  throw new BulleUnavailableError('unsupported', `Bulle backend ${offer.backend || 'unknown'} is not supported`);
}

function chatText(backend: string, body: unknown): string {
  if (backend === 'anthropic') {
    const blocks = Array.isArray(record(body).content) ? (record(body).content as unknown[]) : [];
    return blocks
      .map(record)
      .filter((block) => block.type === 'text')
      .map((block) => text(block.text))
      .join('');
  }
  const choices = Array.isArray(record(body).choices) ? (record(body).choices as unknown[]) : [];
  return text(record(record(choices[0]).message).content);
}

const PROBE_PATHS: Record<string, string> = {
  anthropic: 'v1/models?limit=1',
  openai: 'models',
  openrouter: 'key',
};

/**
 * Calls Bulle as a Glouton user: a Registre token-exchanged JWT (aud bulle)
 * reads the user's model offer and assistant profile, and chat completions go
 * through Bulle's key-holding proxy in the backend's own wire format
 * (Anthropic messages, or OpenAI-compatible chat for openai and openrouter).
 * Every failure is a BulleUnavailableError.
 */
export class BulleClient {
  private readonly baseUrl: string;
  private readonly http: typeof fetch;

  constructor(private readonly config: BulleConfig) {
    this.baseUrl = config.bulleUrl.replace(/\/$/, '');
    this.http = config.fetch ?? fetch;
  }

  /** The backend, default model and persona Bulle runs for this user. */
  async offer(userId: string): Promise<BulleOffer> {
    const body = record(await this.request(userId, 'GET', '/api/llm', READ_TIMEOUT_MS));
    const models = Array.isArray(body.models) ? body.models.map(text).filter(Boolean) : [];
    return { backend: text(body.backend), model: text(body.model), models, persona: text(body.persona) };
  }

  /** The assistant's display name and avatar, as the user set them in Bulle. */
  async profile(userId: string): Promise<BulleProfile> {
    const body = record(await this.request(userId, 'GET', '/api/assistant', READ_TIMEOUT_MS));
    return { name: text(body.name).trim() || 'Bulle', avatarUrl: text(body.avatar_url) || null };
  }

  /** Resolves when Bulle holds a key for the backend; a cheap GET that spends no tokens. */
  async probe(userId: string, backend: string): Promise<void> {
    const path = PROBE_PATHS[backend];
    if (!path) throw new BulleUnavailableError('unsupported', `Bulle backend ${backend || 'unknown'} is not supported`);
    await this.request(userId, 'GET', `/api/llm/${backend}/${path}`, READ_TIMEOUT_MS, undefined, {}, true);
  }

  /** One chat completion, returned as the model's text. */
  async complete(userId: string, offer: BulleOffer, prompt: ChatPrompt): Promise<string> {
    const model = offer.model || offer.models[0];
    if (!model) throw new BulleUnavailableError('unreachable', 'Bulle offers no model');
    const call = chatRequest(offer, model, prompt);
    const body = await this.request(userId, 'POST', `/api/llm/${offer.backend}/${call.path}`, CHAT_TIMEOUT_MS, call.body, call.headers);
    const answer = chatText(offer.backend, body).trim();
    if (!answer) throw new BulleUnavailableError('unreachable', 'Bulle returned an empty answer');
    return answer;
  }

  private async send(
    token: string,
    method: string,
    path: string,
    timeoutMs: number,
    payload: unknown,
    headers: Json
  ): Promise<Response> {
    return this.http(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(headers as Record<string, string>),
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  private async token(userId: string): Promise<string> {
    try {
      return await this.config.tokens.token(userId, BULLE_TARGET);
    } catch (error) {
      if (error instanceof RegistreReconnectError) throw new BulleUnavailableError('not_linked', error.message);
      logger.warn({ err: error, userId }, '[BULLE] Registre token exchange failed');
      throw new BulleUnavailableError('unreachable', 'Registre token exchange for Bulle failed');
    }
  }

  private async request(
    userId: string,
    method: string,
    path: string,
    timeoutMs: number,
    payload?: unknown,
    headers: Json = {},
    keyOnly = false
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.send(await this.token(userId), method, path, timeoutMs, payload, headers);
      if (response.status === 401 && !keyOnly) {
        this.config.tokens.forget(userId, BULLE_TARGET);
        response = await this.send(await this.token(userId), method, path, timeoutMs, payload, headers);
      }
    } catch (error) {
      if (error instanceof BulleUnavailableError) throw error;
      logger.warn({ err: error, path }, '[BULLE] Request failed');
      throw new BulleUnavailableError('unreachable', 'Bulle is unreachable');
    }
    const body = await readJson(response);
    if (response.status === 409) throw new BulleUnavailableError('no_key', text(record(body).error) || 'no key');
    if (keyOnly && response.status < 500) return body;
    if (!response.ok) {
      logger.warn({ status: response.status, path, error: record(body).error ?? body }, '[BULLE] Bulle answered with an error');
      throw new BulleUnavailableError('unreachable', `Bulle answered ${response.status}`);
    }
    return body;
  }
}

/** The Bulle client, or null when BULLE_URL or the Registre client is not configured. */
export function bulleFromEnv(env: { BULLE_URL?: string }, tokens: RegistreTokens | null): BulleClient | null {
  if (!env.BULLE_URL) {
    logger.info('[BULLE] BULLE_URL unset: the writing assistant is off');
    return null;
  }
  if (!tokens) {
    logger.warn('[BULLE] BULLE_URL is set but OIDC is not configured: the writing assistant stays off');
    return null;
  }
  return new BulleClient({ bulleUrl: env.BULLE_URL, tokens });
}
