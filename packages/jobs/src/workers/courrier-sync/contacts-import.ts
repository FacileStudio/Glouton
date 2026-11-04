import type { Prisma, PrismaClient } from '@prisma/client';
import { CourrierReconnectError, type CourrierClient, type CourrierContact } from '@repo/courrier';
import { logger } from '@repo/logger';
import { allowEveryScope, type ScopeGate } from '../../types';

export type ContactSource = Pick<CourrierClient, 'listContacts'>;

export const MAX_SUGGESTIONS_PER_RUN = 200;
const CREATED_BY = 'courrier-import';

export interface ContactsImportResult {
  users: number;
  skipped: number;
  suggested: number;
  failedUsers: number;
  suggestedByUser: Map<string, number>;
}

function splitName(name: string): { firstName: string | null; lastName: string | null } {
  const [first, ...rest] = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: first ?? null, lastName: rest.length > 0 ? rest.join(' ') : null };
}

function payloadEmail(payload: Prisma.JsonValue | null): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const email = payload.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : null;
}

async function knownEmails(prisma: PrismaClient, userId: string, emails: string[]): Promise<Set<string>> {
  const memberships = await prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } });
  const teamIds = memberships.map((m) => m.teamId);
  const [user, people, suggestions] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.person.findMany({
      where: {
        AND: [
          { OR: [{ userId, teamId: null }, ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : [])] },
          { OR: [{ email: { in: emails, mode: 'insensitive' } }, { emails: { hasSome: emails } }] },
        ],
      },
      select: { email: true, emails: true },
    }),
    prisma.suggestion.findMany({
      where: { userId, kind: 'IMPORT', status: { in: ['OPEN', 'DISMISSED'] } },
      select: { payload: true },
    }),
  ]);
  const known = new Set<string>();
  if (user?.email) known.add(user.email.toLowerCase());
  for (const person of people) {
    if (person.email) known.add(person.email.toLowerCase());
    for (const email of person.emails) known.add(email.toLowerCase());
  }
  for (const suggestion of suggestions) {
    const email = payloadEmail(suggestion.payload);
    if (email) known.add(email);
  }
  return known;
}

/**
 * Turns the Courrier contacts the user does not know in Glouton yet into
 * IMPORT suggestions. An address already on a Person in the user's scope, or
 * already proposed (open or dismissed), is skipped. At most
 * MAX_SUGGESTIONS_PER_RUN new suggestions per user per run, most recent first.
 */
export async function suggestImports(
  prisma: PrismaClient,
  userId: string,
  contacts: CourrierContact[]
): Promise<number> {
  const unique = new Map<string, CourrierContact>();
  for (const contact of contacts) {
    const email = contact.email.trim().toLowerCase();
    if (email.includes('@') && !unique.has(email)) unique.set(email, { ...contact, email });
  }
  if (unique.size === 0) return 0;
  const known = await knownEmails(prisma, userId, [...unique.keys()]);
  const fresh = [...unique.values()].filter((c) => !known.has(c.email)).slice(0, MAX_SUGGESTIONS_PER_RUN);
  if (fresh.length === 0) return 0;

  const created = await prisma.suggestion.createMany({
    data: fresh.map((contact) => ({
      userId,
      teamId: null,
      kind: 'IMPORT' as const,
      title: contact.name ? `${contact.name} <${contact.email}>` : contact.email,
      body: `You wrote to ${contact.email} ${contact.sentCount} time(s) from Courrier.`,
      rationale: 'Courrier contact not yet in Glouton',
      payload: {
        email: contact.email,
        ...splitName(contact.name),
        origin: 'COURRIER',
        sentCount: contact.sentCount,
        lastSentAt: contact.lastSentAt?.toISOString() ?? null,
      },
      createdBy: CREATED_BY,
    })),
  });
  return created.count;
}

/**
 * For every user holding a Registre grant, lists their Courrier contacts and
 * proposes the unknown ones as IMPORT suggestions. One user's failure is
 * logged and never stops the others. Suggestions land in the personal scope,
 * so a user whose personal plan lacks Glouton is skipped and counted.
 */
export async function importContacts(
  prisma: PrismaClient,
  courrier: ContactSource,
  allowed: ScopeGate = allowEveryScope
): Promise<ContactsImportResult> {
  const accounts = await prisma.account.findMany({
    where: { refreshToken: { not: null } },
    distinct: ['userId'],
    select: { userId: true },
  });
  const result: ContactsImportResult = {
    users: accounts.length,
    skipped: 0,
    suggested: 0,
    failedUsers: 0,
    suggestedByUser: new Map(),
  };
  for (const { userId } of accounts) {
    if (!(await allowed({ userId, teamId: null }))) {
      result.skipped++;
      continue;
    }
    try {
      const count = await suggestImports(prisma, userId, await courrier.listContacts(userId));
      result.suggested += count;
      if (count > 0) result.suggestedByUser.set(userId, count);
    } catch (error) {
      result.failedUsers++;
      if (error instanceof CourrierReconnectError) {
        logger.info({ userId }, '[COURRIER] Contact import skipped: the user must reconnect their Facile account');
      } else {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn({ userId, error: message }, '[COURRIER] Contact import failed for user');
      }
    }
  }
  return result;
}
