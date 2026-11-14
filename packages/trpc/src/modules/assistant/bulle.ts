import { Client, PlanRequired, StatusError, UnreachableError, type CompleteRequest } from '@facile/tronc/bulle';
import { RegistreReconnectError, type ExchangeTarget, type RegistreTokens } from '@repo/courrier';
import { logger } from '@repo/logger';

export { PlanRequired, StatusError, UnreachableError } from '@facile/tronc/bulle';

export const BULLE_TARGET: ExchangeTarget = { audience: 'bulle', scopes: 'bulle.read bulle.write', label: 'Bulle' };

const COMPLETE_TIMEOUT_MS = 90_000;

/** The Bulle client of @facile/tronc, acting as a Glouton user with their exchanged token. */
export type BulleClient = Client;

/** Why Bulle cannot answer: no Registre grant, no AI in the plan, or Bulle unreachable or refusing. */
export type BulleFailure = 'not_linked' | 'unreachable' | 'plan_required';

/** The plan limit the web app shows: Bulle's 402 fields, with an unsafe upgrade page already dropped. */
export interface PlanLimit {
  message?: string;
  upgrade_url?: string;
  key?: string;
  limit?: number;
}

export interface BulleConfig {
  bulleUrl: string;
  tokens: RegistreTokens;
  fetch?: typeof fetch;
}

/** One completion a Glouton feature asks for: its rules, the task, and the data the task works on. */
export type Completion = Pick<CompleteRequest, 'system' | 'prompt' | 'input' | 'maxTokens'>;

/**
 * The tronc Bulle client for Glouton: the user's Registre refresh token is
 * exchanged for audience bulle, a 401 forgets that token before the one
 * retry, and a failed exchange other than a needed reconnect is unreachable.
 */
export function createBulle(config: BulleConfig): Client {
  return new Client({
    url: config.bulleUrl,
    fetch: config.fetch,
    forget: (user) => config.tokens.forget(user, BULLE_TARGET),
    token: async (user) => {
      try {
        return await config.tokens.token(user, BULLE_TARGET);
      } catch (error) {
        if (error instanceof RegistreReconnectError) throw error;
        logger.warn({ err: error, userId: user }, '[BULLE] Registre token exchange failed');
        throw new UnreachableError('Registre token exchange for Bulle failed', error);
      }
    },
  });
}

/** The refusal Glouton gives before calling Bulle when the scope's plan has no ai.access, shaped like Bulle's 402. */
export function planRequired(message: string, upgradeUrl: string): PlanRequired {
  return new PlanRequired({ code: 'payment_required', message, upgrade_url: upgradeUrl, key: 'ai.access', limit: 0 });
}

/** The reason a Bulle call failed, or null when the error did not come from Bulle. */
export function bulleFailure(error: unknown): BulleFailure | null {
  if (error instanceof PlanRequired) return 'plan_required';
  if (error instanceof RegistreReconnectError) return 'not_linked';
  if (error instanceof UnreachableError || error instanceof StatusError) return 'unreachable';
  return null;
}

/** The fields of a plan refusal, for the tRPC error body and the status. */
export function planLimitFields(error: PlanRequired): PlanLimit {
  return {
    message: error.message || undefined,
    upgrade_url: error.upgradeUrl || undefined,
    key: error.key || undefined,
    limit: error.limit || undefined,
  };
}

/** The plan limit a failed call carries, or undefined for any other error. */
export function planLimitOf(error: { cause?: unknown }): PlanLimit | undefined {
  return error.cause instanceof PlanRequired ? planLimitFields(error.cause) : undefined;
}

/** One completion through Bulle's POST /api/ai/complete, returned as the model's text. */
export async function complete(client: BulleClient, userId: string, request: Completion): Promise<string> {
  const answer = await client.complete(userId, request, COMPLETE_TIMEOUT_MS);
  const text = (answer.text ?? (answer.json === undefined ? '' : JSON.stringify(answer.json))).trim();
  if (!text) throw new UnreachableError('empty answer');
  return text;
}

/** The Bulle client, or null when BULLE_URL or the Registre client is not configured. */
export function bulleFromEnv(env: { BULLE_URL?: string }, tokens: RegistreTokens | null): Client | null {
  if (!env.BULLE_URL) {
    logger.info('[BULLE] BULLE_URL unset: the writing assistant is off');
    return null;
  }
  if (!tokens) {
    logger.warn('[BULLE] BULLE_URL is set but OIDC is not configured: the writing assistant stays off');
    return null;
  }
  return createBulle({ bulleUrl: env.BULLE_URL, tokens });
}
