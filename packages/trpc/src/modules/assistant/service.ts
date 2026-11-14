import type { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { logger } from '@repo/logger';
import { ownedWhere, type Access } from '../contact/access';
import { findCompany, findPerson } from '../contact/service';
import {
  PlanRequired,
  StatusError,
  bulleFailure,
  complete,
  planLimitFields,
  planRequired,
  type BulleClient,
  type BulleFailure,
  type PlanLimit,
} from './bulle';
import {
  NEXT_ACTION_TASK,
  nextActionData,
  parseNextAction,
  parseWriteResponse,
  systemPrompt,
  writeData,
  writeTask,
  type ContactContext,
  type NextActionResult,
  type Sender,
  type WriteInput,
  type WriteResult,
} from './prompt';

export interface AssistantStatus {
  available: boolean;
  reason: BulleFailure | null;
  planLimit?: PlanLimit;
  name: string;
  avatarUrl: string | null;
}

export interface ContactTarget {
  personId?: string;
  companyId?: string;
}

const NEEDS_BODY = new Set<WriteInput['action']>(['rewrite', 'shorter', 'warmer', 'formal', 'fix', 'translate', 'subject']);

export const PLAN_REQUIRED_MESSAGE = 'Les fonctions IA demandent une offre avec accès à l’IA.';

const FAILURE_MESSAGES: Record<BulleFailure, string> = {
  not_linked: 'Reconnectez votre compte Facile pour utiliser Bulle.',
  unreachable: 'Bulle est injoignable pour le moment. Réessayez dans un instant.',
  plan_required: PLAN_REQUIRED_MESSAGE,
};

/** Turns a Bulle failure into the TRPCError the web app shows; rethrows anything else. */
export function assistantError(error: unknown): never {
  if (error instanceof PlanRequired) {
    throw new TRPCError({ code: 'FORBIDDEN', message: error.message || PLAN_REQUIRED_MESSAGE, cause: error });
  }
  if (error instanceof StatusError && error.status === 429) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: error.message || 'Bulle daily limit reached', cause: error });
  }
  const failure = bulleFailure(error);
  if (!failure) throw error;
  if (error instanceof StatusError) logger.warn({ status: error.status, code: error.code, error: error.message }, '[BULLE] Bulle refused the call');
  throw new TRPCError({ code: failure === 'not_linked' ? 'PRECONDITION_FAILED' : 'BAD_GATEWAY', message: FAILURE_MESSAGES[failure], cause: error });
}

/** The Bulle client, or BAD_GATEWAY when this server has none. */
export function requireBulle(bulle: BulleClient | null): BulleClient {
  if (!bulle) throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Bulle n’est pas configuré sur ce serveur.' });
  return bulle;
}

/**
 * Whether Bulle can write for this user in a scope, and how it presents
 * itself. The scope's plan must carry ai.access; reading the assistant
 * profile then proves the token exchange and Bulle itself answer.
 */
export async function assistantStatus(
  bulle: BulleClient | null,
  userId: string,
  ai: { allowed: boolean; upgradeUrl: string }
): Promise<AssistantStatus> {
  const down = (reason: BulleFailure, planLimit?: PlanLimit): AssistantStatus => ({
    available: false,
    reason,
    ...(planLimit ? { planLimit } : {}),
    name: 'Bulle',
    avatarUrl: null,
  });
  if (!bulle) return down('unreachable');
  if (!ai.allowed) return down('plan_required', planLimitFields(planRequired(PLAN_REQUIRED_MESSAGE, ai.upgradeUrl)));
  try {
    const profile = (await bulle.call<{ name?: unknown; avatar_url?: unknown }>(userId, { method: 'GET', segments: ['assistant'] })) ?? {};
    const name = typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : 'Bulle';
    const avatarUrl = typeof profile.avatar_url === 'string' && profile.avatar_url ? profile.avatar_url : null;
    return { available: true, reason: null, name, avatarUrl };
  } catch (error) {
    const reason = bulleFailure(error);
    if (!reason) throw error;
    return down(reason, error instanceof PlanRequired ? planLimitFields(error) : undefined);
  }
}

/** Loads the person or company, its people and last 10 activities, all inside the caller's access. */
export async function loadContact(prisma: PrismaClient, access: Access, target: ContactTarget): Promise<ContactContext> {
  const person = target.personId ? await findPerson(prisma, access, target.personId) : null;
  const companyId = target.companyId ?? person?.companyId ?? null;
  const company = target.companyId
    ? await findCompany(prisma, access, target.companyId)
    : companyId
      ? await prisma.company.findFirst({ where: { id: companyId, deletedAt: null, ...ownedWhere(access) } })
      : null;
  const activityTarget = person ? { personId: person.id } : company ? { companyId: company.id } : null;
  const [people, activities] = await Promise.all([
    company && !person
      ? prisma.person.findMany({
          where: { companyId: company.id, deletedAt: null, ...ownedWhere(access) },
          orderBy: { createdAt: 'asc' },
          take: 10,
          select: { firstName: true, lastName: true, role: true, email: true },
        })
      : [],
    activityTarget
      ? prisma.activity.findMany({
          where: { ...activityTarget, ...ownedWhere(access) },
          orderBy: { occurredAt: 'desc' },
          take: 10,
          select: { kind: true, summary: true, occurredAt: true },
        })
      : [],
  ]);
  return { person, company, people, activities };
}

/** Runs one writing action through Bulle with the contact facts Glouton loaded itself. */
export async function write(
  prisma: PrismaClient,
  bulle: BulleClient | null,
  access: Access,
  sender: Sender,
  input: WriteInput & ContactTarget
): Promise<WriteResult> {
  const client = requireBulle(bulle);
  if (NEEDS_BODY.has(input.action) && !input.body?.trim()) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Écrivez d’abord un message pour que Bulle le retravaille.' });
  }
  const contact = await loadContact(prisma, access, input);
  try {
    const raw = await complete(client, access.userId, {
      system: systemPrompt('write', input.language),
      prompt: writeTask(input),
      input: writeData(input, contact, sender),
      maxTokens: 2000,
    });
    const result = parseWriteResponse(raw);
    return input.action === 'subject' ? { ...result, body: input.body ?? '' } : result;
  } catch (error) {
    return assistantError(error);
  }
}

/** Asks Bulle for a short status and the next steps with one person or company. */
export async function nextAction(
  prisma: PrismaClient,
  bulle: BulleClient | null,
  access: Access,
  sender: Sender,
  target: ContactTarget
): Promise<NextActionResult> {
  const client = requireBulle(bulle);
  const contact = await loadContact(prisma, access, target);
  try {
    const raw = await complete(client, access.userId, {
      system: systemPrompt('nextAction', 'fr'),
      prompt: NEXT_ACTION_TASK,
      input: nextActionData(contact, sender),
      maxTokens: 1500,
    });
    return parseNextAction(raw);
  } catch (error) {
    return assistantError(error);
  }
}
