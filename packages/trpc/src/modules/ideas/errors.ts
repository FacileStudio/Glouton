import { TRPCError } from '@trpc/server';
import { StatusError, planRequired } from '../assistant/bulle';
import { assistantError } from '../assistant/service';
import type { IdeasSpace } from './service';

const REFUSAL_CODES: Record<number, TRPCError['code']> = {
  400: 'BAD_REQUEST',
  401: 'PRECONDITION_FAILED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'TOO_MANY_REQUESTS',
};

/** Refuses with plan_required when the space's plan has no ai.access. */
export function requireAi(space: IdeasSpace): void {
  if (space.aiAccess) return;
  assistantError(planRequired('Les idées demandent une offre avec accès à l’IA.', space.upgradeUrl));
}

/** Maps a Bulle failure to the error the page shows, keeping plan refusals' upgrade link. */
export function ideasError(error: unknown): never {
  if (error instanceof StatusError) {
    throw new TRPCError({ code: REFUSAL_CODES[error.status] ?? 'BAD_GATEWAY', message: error.message || `Bulle answered ${error.status}`, cause: error });
  }
  return assistantError(error);
}
