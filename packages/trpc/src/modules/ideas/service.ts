import type { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { record, text } from '@repo/courrier';
import { BulleRefusal, BulleUnavailableError, type BulleClient } from '../assistant/bulle';
import { assistantError, requireBulle } from '../assistant/service';
import type { ForfaitReader } from '../forfait/store';
import { pageView, runView, type IdeasPageView, type RunView } from './view';

/** Bulle scopes ideas by app; Glouton's are `glouton`. */
export const IDEAS_APP = 'glouton';

export interface IdeasDeps {
  prisma: Pick<PrismaClient, 'team'>;
  bulle: BulleClient | null;
  forfait: ForfaitReader;
}

/** Who asks and in which Glouton space. */
export interface IdeasCaller {
  userId: string;
  teamId?: string;
}

/** The space a call works in: Bulle's space id (the Registre space, or none for personal) and the AI plan. */
export interface IdeasSpace {
  spaceId: string | null;
  aiAccess: boolean;
  upgradeUrl: string;
}

const REFUSAL_CODES: Record<number, TRPCError['code']> = {
  400: 'BAD_REQUEST',
  401: 'PRECONDITION_FAILED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
};

/**
 * The caller's space after a membership check through the same reader the
 * plan gate uses. A team maps to its Registre shared space, which Bulle
 * accepts as space_id; personal sends none and Bulle uses the default space.
 */
export async function ideasSpace(deps: IdeasDeps, caller: IdeasCaller): Promise<IdeasSpace> {
  if (!caller.teamId) {
    const verdict = await deps.forfait.personal(caller.userId);
    return { spaceId: null, aiAccess: Boolean(verdict?.aiAccess), upgradeUrl: verdict?.upgradeUrl ?? '' };
  }
  const verdict = await deps.forfait.team(caller.userId, caller.teamId);
  if (!verdict) throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this team' });
  const team = await deps.prisma.team.findUnique({ where: { id: caller.teamId }, select: { registreSpaceId: true } });
  return { spaceId: team?.registreSpaceId ?? null, aiAccess: Boolean(verdict.aiAccess), upgradeUrl: verdict.upgradeUrl };
}

function requireAi(space: IdeasSpace): void {
  if (space.aiAccess) return;
  assistantError(
    new BulleUnavailableError('plan_required', 'Les idées demandent une offre avec accès à l’IA.', {
      key: 'ai.access',
      upgrade_url: space.upgradeUrl || undefined,
    })
  );
}

/** A Bulle path with Glouton's app and the space as query parameters. */
export function ideasPath(path: string, space: IdeasSpace, app = true): string {
  const query = new URLSearchParams();
  if (app) query.set('app', IDEAS_APP);
  if (space.spaceId) query.set('space_id', space.spaceId);
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Maps a Bulle failure to the error the page shows, keeping plan refusals' upgrade link. */
export function ideasError(error: unknown): never {
  if (error instanceof BulleRefusal) {
    throw new TRPCError({ code: REFUSAL_CODES[error.status] ?? 'BAD_GATEWAY', message: error.message, cause: error });
  }
  return assistantError(error);
}

async function ask(deps: IdeasDeps, userId: string, method: string, path: string, payload?: unknown): Promise<unknown> {
  try {
    return await requireBulle(deps.bulle).call(userId, method, path, payload);
  } catch (error) {
    return ideasError(error);
  }
}

/** The space's Glouton ideas, or only the plan state when the space has no AI (reads cost nothing, but there is nothing to run). */
export async function listIdeas(deps: IdeasDeps, caller: IdeasCaller): Promise<IdeasPageView> {
  const space = await ideasSpace(deps, caller);
  if (!space.aiAccess) {
    return { aiAccess: false, upgradeUrl: space.upgradeUrl, ideas: [], generating: false, lastBatchAt: null };
  }
  return pageView(await ask(deps, caller.userId, 'GET', ideasPath('/api/ideas', space)), space.upgradeUrl);
}

/** Starts a batch of Glouton ideas in the space; Bulle caps it at three a day. */
export async function generateIdeas(deps: IdeasDeps, caller: IdeasCaller): Promise<{ batchId: string }> {
  const space = await ideasSpace(deps, caller);
  requireAi(space);
  const body = await ask(deps, caller.userId, 'POST', ideasPath('/api/ideas/generate', space), { space_id: space.spaceId ?? '' });
  return { batchId: text(record(body).batch_id) };
}

/** Runs one idea in the background; the page then polls the run. */
export async function runIdea(deps: IdeasDeps, caller: IdeasCaller, ideaId: string): Promise<{ runId: string }> {
  const space = await ideasSpace(deps, caller);
  requireAi(space);
  const body = await ask(deps, caller.userId, 'POST', ideasPath(`/api/ideas/${encodeURIComponent(ideaId)}/run`, space, false));
  return { runId: text(record(body).run_id) };
}

/** The run's state, summary, outputs and pending approvals. */
export async function getRun(deps: IdeasDeps, caller: IdeasCaller, runId: string): Promise<RunView> {
  await ideasSpace(deps, caller);
  return runView(await ask(deps, caller.userId, 'GET', `/api/runs/${encodeURIComponent(runId)}`));
}

/** Answers a pending approval. The path is built here, never taken from the client. */
export async function decide(deps: IdeasDeps, caller: IdeasCaller, runId: string, callId: string, approve: boolean): Promise<void> {
  const space = await ideasSpace(deps, caller);
  if (approve) requireAi(space);
  await ask(deps, caller.userId, 'POST', `/api/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(callId)}`, { approve });
}

/** Hides an idea for good. */
export async function dismissIdea(deps: IdeasDeps, caller: IdeasCaller, ideaId: string): Promise<void> {
  await ideasSpace(deps, caller);
  await ask(deps, caller.userId, 'PATCH', `/api/ideas/${encodeURIComponent(ideaId)}`, { status: 'dismissed' });
}
