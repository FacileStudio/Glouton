import type { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { BulleClient } from '../assistant/bulle';
import { requireBulle } from '../assistant/service';
import { ideasError, requireAi } from './errors';
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

async function ask<T>(deps: IdeasDeps, call: (bulle: BulleClient) => Promise<T>): Promise<T> {
  try {
    return await call(requireBulle(deps.bulle));
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
  return pageView(await ask(deps, (bulle) => bulle.ideas(caller.userId, IDEAS_APP, space.spaceId ?? '')), space.upgradeUrl);
}

/** Starts a batch of Glouton ideas in the space; Bulle caps it at three a day. */
export async function generateIdeas(deps: IdeasDeps, caller: IdeasCaller): Promise<{ batchId: string }> {
  const space = await ideasSpace(deps, caller);
  requireAi(space);
  const batch = await ask(deps, (bulle) => bulle.generate(caller.userId, IDEAS_APP, space.spaceId ?? ''));
  return { batchId: batch.batch_id ?? '' };
}

/** Runs one idea in the background; the page then polls the run. */
export async function runIdea(deps: IdeasDeps, caller: IdeasCaller, ideaId: string): Promise<{ runId: string }> {
  const space = await ideasSpace(deps, caller);
  requireAi(space);
  const run = await ask(deps, (bulle) => bulle.run(caller.userId, ideaId, space.spaceId ?? ''));
  return { runId: run.run_id ?? '' };
}

/** The run's state, summary, outputs and pending approvals. */
export async function getRun(deps: IdeasDeps, caller: IdeasCaller, runId: string): Promise<RunView> {
  await ideasSpace(deps, caller);
  return runView(await ask(deps, (bulle) => bulle.runStatus(caller.userId, runId)));
}

/** Answers a pending approval. The client escapes the ids; a path is never taken from Bulle or the browser. */
export async function decide(deps: IdeasDeps, caller: IdeasCaller, runId: string, callId: string, approve: boolean): Promise<void> {
  const space = await ideasSpace(deps, caller);
  if (approve) requireAi(space);
  await ask(deps, (bulle) => bulle.decide(caller.userId, runId, callId, approve));
}

/** Hides an idea for good. */
export async function dismissIdea(deps: IdeasDeps, caller: IdeasCaller, ideaId: string): Promise<void> {
  await ideasSpace(deps, caller);
  await ask(deps, (bulle) => bulle.dismiss(caller.userId, ideaId));
}
