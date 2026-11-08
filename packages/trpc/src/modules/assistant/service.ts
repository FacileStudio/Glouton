import type { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { ownedWhere, type Access } from '../contact/access';
import { findCompany, findPerson } from '../contact/service';
import { BulleUnavailableError, type BulleClient, type BulleFailure, type PlanLimit } from './bulle';
import {
  nextActionPrompt,
  parseNextAction,
  parseWriteResponse,
  systemPrompt,
  writePrompt,
  type ContactContext,
  type NextActionResult,
  type Sender,
  type WriteInput,
  type WriteResult,
} from './prompt';

export interface AssistantStatus {
  available: boolean;
  reason: 'not_linked' | 'no_key' | 'unreachable' | 'plan_required' | null;
  planLimit?: PlanLimit;
  name: string;
  avatarUrl: string | null;
  model: string | null;
}

export interface ContactTarget {
  personId?: string;
  companyId?: string;
}

const NEEDS_BODY = new Set<WriteInput['action']>(['rewrite', 'shorter', 'warmer', 'formal', 'fix', 'translate', 'subject']);

const FAILURE_MESSAGES: Record<BulleFailure, string> = {
  not_linked: 'Reconnectez votre compte Facile pour utiliser Bulle.',
  no_key: 'Bulle n’a pas de clé de modèle. Ajoutez-en une dans les réglages de Bulle.',
  unreachable: 'Bulle est injoignable pour le moment. Réessayez dans un instant.',
  unsupported: 'Le modèle choisi dans Bulle (Google) n’est pas encore pris en charge par Glouton.',
  plan_required: 'Les fonctions IA demandent une offre avec accès à l’IA.',
};

function statusReason(reason: BulleFailure): AssistantStatus['reason'] {
  return reason === 'unsupported' ? 'unreachable' : reason;
}

/** Turns a Bulle failure into the TRPCError the web app shows; rethrows anything else. */
export function assistantError(error: unknown): never {
  if (error instanceof BulleUnavailableError) {
    const code = error.reason === 'unreachable' ? 'BAD_GATEWAY' : error.reason === 'plan_required' ? 'FORBIDDEN' : 'PRECONDITION_FAILED';
    const message = error.reason === 'plan_required' ? (error.planLimit?.message ?? FAILURE_MESSAGES.plan_required) : FAILURE_MESSAGES[error.reason];
    throw new TRPCError({ code, message, cause: error });
  }
  throw error;
}

/** The Bulle client, or BAD_GATEWAY when this server has none. */
export function requireBulle(bulle: BulleClient | null): BulleClient {
  if (!bulle) throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Bulle n’est pas configuré sur ce serveur.' });
  return bulle;
}

/** Whether Bulle can write for this user, and how it presents itself. */
export async function assistantStatus(bulle: BulleClient | null, userId: string): Promise<AssistantStatus> {
  const down = (reason: AssistantStatus['reason'], planLimit: PlanLimit | null = null): AssistantStatus => ({
    available: false,
    reason,
    ...(planLimit ? { planLimit } : {}),
    name: 'Bulle',
    avatarUrl: null,
    model: null,
  });
  if (!bulle) return down('unreachable');
  try {
    const offer = await bulle.offer(userId);
    const [profile, probe] = await Promise.all([
      bulle.profile(userId).catch(() => ({ name: 'Bulle', avatarUrl: null })),
      bulle.probe(userId, offer.backend).then(
        () => null,
        (error: unknown) => error
      ),
    ]);
    const reason = probe instanceof BulleUnavailableError ? statusReason(probe.reason) : probe ? 'unreachable' : null;
    return {
      available: reason === null,
      reason,
      ...(probe instanceof BulleUnavailableError && probe.planLimit ? { planLimit: probe.planLimit } : {}),
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      model: offer.model || offer.models[0] || null,
    };
  } catch (error) {
    if (error instanceof BulleUnavailableError) return down(statusReason(error.reason), error.planLimit);
    throw error;
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
    const offer = await client.offer(access.userId);
    const raw = await client.complete(access.userId, offer, {
      system: systemPrompt(offer.persona, 'write', input.language),
      user: writePrompt(input, contact, sender),
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
    const offer = await client.offer(access.userId);
    const raw = await client.complete(access.userId, offer, {
      system: systemPrompt(offer.persona, 'nextAction', 'fr'),
      user: nextActionPrompt(contact, sender),
      maxTokens: 1500,
    });
    return parseNextAction(raw);
  } catch (error) {
    return assistantError(error);
  }
}
