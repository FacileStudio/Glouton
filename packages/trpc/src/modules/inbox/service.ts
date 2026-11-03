import type { ContactOrigin, Prisma, PrismaClient, SuggestionKind, SuggestionStatus } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { AuthManager } from '@repo/auth';
import { verifyEmail } from '@repo/jobs';
import { actorLabel, ownedWhere, targetTeam, type Access } from '../contact/access';
import { findCompany, findPerson, logActivity, normalizeEmail, type SyncHooks } from '../contact/service';
import { createCompanyFromClient, linkCompanyToClient, parseRemoteClient } from '../ardoise/mapping';
import { sendOutreach } from '../email/transport';
import { CourrierReconnectError, type CourrierClient } from '@repo/courrier';

export type Notify = (
  scope: { type: 'personal' | 'team'; userId: string; teamId?: string },
  type: string,
  data: Record<string, unknown>
) => void | Promise<void>;

export interface DraftInput {
  personId: string;
  subject: string;
  html?: string | null;
  text: string;
  rationale?: string | null;
}

export interface DraftUpdate {
  subject?: string;
  html?: string | null;
  text?: string;
  rationale?: string | null;
}

export interface SuggestionInput {
  kind: SuggestionKind;
  title: string;
  body?: string | null;
  rationale?: string | null;
  companyId?: string | null;
  personId?: string | null;
  teamId?: string | null;
  payload?: Prisma.InputJsonValue;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Renders plain text as paragraphs, so a text-only draft still has an HTML part. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function scopeOf(access: Access, teamId: string | null) {
  return teamId
    ? { type: 'team' as const, userId: access.userId, teamId }
    : { type: 'personal' as const, userId: access.userId };
}

const draftSelect = {
  id: true,
  teamId: true,
  status: true,
  subject: true,
  htmlBody: true,
  textBody: true,
  origin: true,
  rationale: true,
  personId: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
  person: { select: { id: true, firstName: true, lastName: true, email: true, emailVerified: true } },
  company: { select: { id: true, name: true } },
} as const;

export async function createDraft(prisma: PrismaClient, access: Access, input: DraftInput, notify?: Notify) {
  const person = await findPerson(prisma, access, input.personId);
  const draft = await prisma.emailOutreach.create({
    data: {
      userId: access.userId,
      teamId: person.teamId,
      personId: person.id,
      companyId: person.companyId,
      subject: input.subject,
      htmlBody: input.html ?? textToHtml(input.text),
      textBody: input.text,
      variables: {},
      status: 'DRAFT',
      origin: access.actor ? 'AGENT' : 'HUMAN',
      rationale: input.rationale ?? null,
    },
    select: draftSelect,
  });
  await notify?.(scopeOf(access, draft.teamId), 'draft:new', { id: draft.id, personId: person.id });
  return draft;
}

async function findDraft(prisma: PrismaClient, access: Access, id: string) {
  const draft = await prisma.emailOutreach.findFirst({ where: { id, ...ownedWhere(access) } });
  if (!draft) throw new TRPCError({ code: 'NOT_FOUND', message: 'Draft not found' });
  if (draft.status !== 'DRAFT') {
    throw new TRPCError({ code: 'CONFLICT', message: 'This email is no longer a draft' });
  }
  return draft;
}

export async function updateDraft(prisma: PrismaClient, access: Access, id: string, input: DraftUpdate) {
  const draft = await findDraft(prisma, access, id);
  const text = input.text ?? draft.textBody;
  const html = input.html !== undefined ? input.html ?? textToHtml(text) : input.text !== undefined ? textToHtml(text) : draft.htmlBody;
  const updated = await prisma.emailOutreach.updateMany({
    where: { id, status: 'DRAFT' },
    data: {
      subject: input.subject ?? draft.subject,
      textBody: text,
      htmlBody: html,
      ...(input.rationale !== undefined ? { rationale: input.rationale } : {}),
    },
  });
  if (updated.count === 0) throw new TRPCError({ code: 'CONFLICT', message: 'This email is no longer a draft' });
  return prisma.emailOutreach.findUniqueOrThrow({ where: { id }, select: draftSelect });
}

export async function discardDraft(prisma: PrismaClient, access: Access, id: string) {
  await findDraft(prisma, access, id);
  await prisma.emailOutreach.deleteMany({ where: { id, status: 'DRAFT' } });
  return { id, discarded: true };
}

export async function listDrafts(prisma: PrismaClient, access: Access) {
  return prisma.emailOutreach.findMany({
    where: { ...ownedWhere(access), status: 'DRAFT' },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: draftSelect,
  });
}

/**
 * Sends a draft after a person clicked Send: re-verifies the recipient,
 * hands the mail to the single transport seam, then records the result.
 */
export async function sendDraft(
  prisma: PrismaClient,
  auth: AuthManager,
  access: Access,
  id: string,
  courrier?: CourrierClient | null
) {
  if (access.actor) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only a person can send an email' });
  const draft = await findDraft(prisma, access, id);
  if (!draft.personId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This draft has no recipient' });
  const person = await findPerson(prisma, access, draft.personId);
  const to = normalizeEmail(person.email);
  if (!to) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This person has no email address' });

  const verification = await verifyEmail(to);
  await prisma.person.update({ where: { id: person.id }, data: { emailVerified: verification.valid } });
  if (!verification.valid) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Cannot send to ${to}: the address failed verification (${verification.reason})`,
    });
  }

  const claimed = await prisma.emailOutreach.updateMany({
    where: { id, status: 'DRAFT' },
    data: { status: 'PENDING' },
  });
  if (claimed.count === 0) throw new TRPCError({ code: 'CONFLICT', message: 'This email is no longer a draft' });

  let sent: Awaited<ReturnType<typeof sendOutreach>>;
  try {
    sent = await sendOutreach({
      prisma,
      auth,
      courrier,
      scope: scopeOf(access, draft.teamId),
      mail: { to, subject: draft.subject, html: draft.htmlBody, text: draft.textBody },
    });
  } catch (error) {
    if (error instanceof CourrierReconnectError) {
      await prisma.emailOutreach.update({ where: { id }, data: { status: 'DRAFT' } });
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error.message });
    }
    await prisma.emailOutreach.update({
      where: { id },
      data: { status: 'FAILED', error: error instanceof Error ? error.message : 'Unknown error' },
    });
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: error instanceof Error ? error.message : 'Sending failed',
    });
  }

  const sentAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.emailOutreach.update({
      where: { id },
      data: { status: 'SENT', sentAt, courrierAccountId: sent.transport === 'courrier' ? sent.courrierAccountId : null },
    });
    await tx.person.updateMany({ where: { id: person.id, stage: 'PROSPECT' }, data: { stage: 'CONTACTED' } });
    if (person.companyId) {
      await tx.company.updateMany({ where: { id: person.companyId, stage: 'PROSPECT' }, data: { stage: 'CONTACTED' } });
    }
    await logActivity(tx, access, {
      teamId: draft.teamId,
      companyId: person.companyId,
      personId: person.id,
      kind: 'email.sent',
      summary: `Email sent: ${draft.subject}`,
      payload: { outreachId: id, to, transport: sent.transport },
    });
  });
  return { id, status: 'SENT' as const, sentAt };
}

async function suggestionTeam(prisma: PrismaClient, access: Access, input: SuggestionInput) {
  if (input.personId) {
    const person = await findPerson(prisma, access, input.personId);
    return { teamId: person.teamId, companyId: input.companyId ?? person.companyId };
  }
  if (input.companyId) {
    const company = await findCompany(prisma, access, input.companyId);
    return { teamId: company.teamId, companyId: company.id };
  }
  return { teamId: targetTeam(access, input.teamId), companyId: null };
}

export async function createSuggestion(
  prisma: PrismaClient,
  access: Access,
  input: SuggestionInput,
  notify?: Notify
) {
  const { teamId, companyId } = await suggestionTeam(prisma, access, input);
  const suggestion = await prisma.suggestion.create({
    data: {
      userId: access.userId,
      teamId,
      companyId,
      personId: input.personId ?? null,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      rationale: input.rationale ?? null,
      payload: input.payload,
      createdBy: actorLabel(access),
    },
  });
  await notify?.(scopeOf(access, teamId), 'suggestion:new', { id: suggestion.id, kind: suggestion.kind });
  return suggestion;
}

export async function listSuggestions(prisma: PrismaClient, access: Access, status: SuggestionStatus = 'OPEN') {
  return prisma.suggestion.findMany({
    where: { ...ownedWhere(access), status },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      company: { select: { id: true, name: true } },
      person: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
}

export async function inboxCounts(prisma: PrismaClient, access: Access) {
  const [drafts, suggestions] = await Promise.all([
    prisma.emailOutreach.count({ where: { ...ownedWhere(access), status: 'DRAFT' } }),
    prisma.suggestion.count({ where: { ...ownedWhere(access), status: 'OPEN' } }),
  ]);
  return { drafts, suggestions, total: drafts + suggestions };
}

type Payload = Record<string, unknown>;

function payloadOf(value: Prisma.JsonValue | null): Payload {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Payload) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

const TEMPERATURES = ['HOT', 'WARM', 'COLD'] as const;
const ORIGINS: ContactOrigin[] = ['HUNT', 'CSV', 'MANUAL', 'ARDOISE', 'COURRIER', 'AGENT'];

type Suggestion = Prisma.SuggestionGetPayload<object>;

async function applyRescore(tx: Prisma.TransactionClient, access: Access, s: Suggestion, payload: Payload) {
  const companyId = s.companyId;
  if (!companyId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'A re-score needs a company' });
  const data: { temperature?: (typeof TEMPERATURES)[number]; score?: number } = {};
  const temperature = TEMPERATURES.find((t) => t === payload.temperature);
  if (temperature) data.temperature = temperature;
  if (typeof payload.score === 'number' && payload.score >= 0 && payload.score <= 100) data.score = Math.round(payload.score);
  await tx.company.update({ where: { id: companyId }, data });
  await logActivity(tx, access, {
    teamId: s.teamId,
    companyId,
    kind: 'note',
    summary: `Re-scored: ${s.title}`,
    payload: { suggestionId: s.id, ...data },
  });
}

async function applyMatch(
  tx: Prisma.TransactionClient,
  access: Access,
  s: Suggestion,
  payload: Payload
): Promise<string | null> {
  const ardoiseClientId = str(payload.ardoiseClientId);
  const client = parseRemoteClient(payload.client);
  if (client && s.companyId) {
    const company = await findCompany(tx, access, s.companyId);
    const linked = await linkCompanyToClient(tx, company, client, {
      reason: 'match confirmed',
      actor: actorLabel(access),
      userId: access.userId,
      suggestionId: s.id,
    });
    if (!linked) throw new TRPCError({ code: 'CONFLICT', message: 'This Ardoise client is already linked to another company' });
    return company.id;
  }
  if (ardoiseClientId && s.companyId) {
    await tx.company.update({ where: { id: s.companyId }, data: { ardoiseClientId, ardoiseSyncedAt: new Date() } });
    await logActivity(tx, access, {
      teamId: s.teamId,
      companyId: s.companyId,
      kind: 'ardoise.client.linked',
      summary: `Linked to Ardoise client ${ardoiseClientId}`,
      payload: { suggestionId: s.id, ardoiseClientId },
    });
    return s.companyId;
  }
  const personId = s.personId ?? str(payload.personId);
  const companyId = str(payload.companyId) ?? s.companyId;
  if (!personId || !companyId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'A match needs a person and a company' });
  await findPerson(tx, access, personId);
  await findCompany(tx, access, companyId);
  await tx.person.update({ where: { id: personId }, data: { companyId } });
  await logActivity(tx, access, {
    teamId: s.teamId,
    companyId,
    personId,
    kind: 'note',
    summary: `Linked person to company: ${s.title}`,
    payload: { suggestionId: s.id },
  });
  return null;
}

/** Dismissing an Ardoise match means "a different company": create it from the Ardoise client. */
async function dismissMatch(tx: Prisma.TransactionClient, s: Suggestion, payload: Payload): Promise<string | null> {
  const client = payload.source === 'ardoise' ? parseRemoteClient(payload.client) : null;
  if (!client) return null;
  const holder = await tx.company.findFirst({ where: { ardoiseClientId: client.id }, select: { id: true } });
  if (holder) return null;
  const created = await createCompanyFromClient(tx, { teamId: s.teamId, ownerId: s.userId }, client);
  return created.id;
}

async function applyImport(tx: Prisma.TransactionClient, access: Access, s: Suggestion, payload: Payload) {
  const companyId = str(payload.companyId) ?? s.companyId;
  if (companyId) await findCompany(tx, access, companyId);
  const origin = ORIGINS.find((o) => o === payload.origin) ?? 'COURRIER';
  const person = await tx.person.create({
    data: {
      userId: access.userId,
      teamId: s.teamId,
      companyId,
      firstName: str(payload.firstName),
      lastName: str(payload.lastName),
      email: normalizeEmail(str(payload.email)),
      role: str(payload.role),
      emails: [],
      phones: [],
      origin,
    },
  });
  await logActivity(tx, access, {
    teamId: s.teamId,
    companyId,
    personId: person.id,
    kind: 'contact.imported',
    summary: `Imported ${s.title}`,
    payload: { suggestionId: s.id },
  });
}

async function applyFollowUp(tx: Prisma.TransactionClient, access: Access, s: Suggestion, payload: Payload) {
  const subject = str(payload.subject);
  const text = str(payload.text);
  if (!s.personId || !subject || !text) return;
  const person = await findPerson(tx, access, s.personId);
  await tx.emailOutreach.create({
    data: {
      userId: access.userId,
      teamId: person.teamId,
      personId: person.id,
      companyId: person.companyId,
      subject,
      textBody: text,
      htmlBody: str(payload.html) ?? textToHtml(text),
      variables: {},
      status: 'DRAFT',
      origin: 'AGENT',
      rationale: s.rationale,
    },
  });
}

/**
 * Records a person's decision on a suggestion and applies it when accepted.
 * An Ardoise match links on accept and creates a new client company on dismiss.
 */
export async function decideSuggestion(
  prisma: PrismaClient,
  access: Access,
  id: string,
  decision: 'ACCEPT' | 'DISMISS',
  hooks: SyncHooks = {}
) {
  const suggestion = await prisma.suggestion.findFirst({ where: { id, ...ownedWhere(access) } });
  if (!suggestion) throw new TRPCError({ code: 'NOT_FOUND', message: 'Suggestion not found' });
  if (suggestion.status !== 'OPEN') throw new TRPCError({ code: 'CONFLICT', message: 'Already decided' });

  let synced: string | null = null;
  const decided = await prisma.$transaction(async (tx) => {
    const claimed = await tx.suggestion.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: decision === 'ACCEPT' ? 'ACCEPTED' : 'DISMISSED', decidedAt: new Date() },
    });
    if (claimed.count === 0) throw new TRPCError({ code: 'CONFLICT', message: 'Already decided' });
    if (decision === 'ACCEPT') {
      const payload = payloadOf(suggestion.payload);
      switch (suggestion.kind) {
        case 'RESCORE':
          await applyRescore(tx, access, suggestion, payload);
          break;
        case 'MATCH':
          synced = await applyMatch(tx, access, suggestion, payload);
          break;
        case 'IMPORT':
          await applyImport(tx, access, suggestion, payload);
          break;
        case 'NEXT_ACTION':
          await logActivity(tx, access, {
            teamId: suggestion.teamId,
            companyId: suggestion.companyId,
            personId: suggestion.personId,
            kind: 'note',
            summary: suggestion.body ? `${suggestion.title}: ${suggestion.body}` : suggestion.title,
            payload: { suggestionId: suggestion.id, nextAction: true },
          });
          break;
        case 'DRAFT':
        case 'FOLLOW_UP':
          await applyFollowUp(tx, access, suggestion, payload);
          break;
      }
    } else if (suggestion.kind === 'MATCH') {
      synced = await dismissMatch(tx, suggestion, payloadOf(suggestion.payload));
    }
    return tx.suggestion.findUniqueOrThrow({ where: { id } });
  });
  if (synced) await hooks.companyChanged?.(synced);
  return decided;
}
