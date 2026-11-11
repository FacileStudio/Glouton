import { TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import { failure, invalid, TroncError, type ToolRequest } from '@facile/tronc/mcp';
import { forfait } from '@repo/trpc';
import { snakeKey } from './mcp-format';

/** The envelope code of each tRPC error a contact service throws. */
const CODES: Record<string, string> = {
  BAD_REQUEST: 'invalid_argument',
  UNPROCESSABLE_CONTENT: 'invalid_argument',
  NOT_FOUND: 'not_found',
  FORBIDDEN: 'permission_denied',
  CONFLICT: 'failed_precondition',
  PRECONDITION_FAILED: 'failed_precondition',
  PAYMENT_REQUIRED: 'payment_required',
  TOO_MANY_REQUESTS: 'rate_limited',
};

/**
 * Turns a contact service error into one a model can act on: a bad argument,
 * a missing row (with hint naming the tool that lists ids), a refusal or a
 * plan refusal with its upgrade page. Anything else stays as it is, so the
 * kit reports it as unavailable and logs it.
 */
export function serviceError(err: unknown, hint = ''): unknown {
  if (err instanceof ZodError) {
    return failure(invalid(err.issues.map((i) => `${i.path.map((p) => snakeKey(String(p))).join('.')}: ${i.message}`).join('; ')));
  }
  if (err instanceof TRPCError && CODES[err.code]) {
    return failure(new TroncError(CODES[err.code]!, err.message, { upgradeUrl: forfait.upgradeUrlOf(err) }), hint);
  }
  return err;
}

/** Runs fn and turns its service errors into model-facing failures. */
export function guarded<In, Out>(hint: string, fn: (input: In, req: ToolRequest) => Promise<Out>) {
  return async (input: In, req: ToolRequest): Promise<Out> => {
    try {
      return await fn(input, req);
    } catch (err) {
      throw serviceError(err, hint);
    }
  };
}

/** Awaits a row lookup, turning its NOT_FOUND into the kit's not_found so a gone target reads as missing. */
export async function found<T>(lookup: Promise<T>): Promise<T> {
  try {
    return await lookup;
  } catch (err) {
    if (err instanceof TRPCError && err.code === 'NOT_FOUND') throw new TroncError('not_found', err.message);
    throw err;
  }
}

/** The tRPC code of each kit error the confirm page can meet. */
const PAGE_CODES: Record<string, TRPCError['code']> = {
  not_found: 'NOT_FOUND',
  failed_precondition: 'CONFLICT',
  permission_denied: 'FORBIDDEN',
};

/** Runs a confirm page call and turns a kit error into the tRPC error the page shows. */
export async function pageCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TroncError && PAGE_CODES[err.code]) throw new TRPCError({ code: PAGE_CODES[err.code]!, message: err.message });
    throw err;
  }
}
