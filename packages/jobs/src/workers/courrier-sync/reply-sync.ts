import type { PrismaClient } from '@prisma/client';
import { CourrierReconnectError, type CourrierClient } from '@repo/courrier';
import { logger } from '@repo/logger';

export type ReplySource = Pick<CourrierClient, 'searchFrom'>;

export const REPLY_WINDOW_DAYS = 30;
const OPEN_STATUSES = ['SENT', 'OPENED', 'CLICKED'] as const;
const ACTOR = 'courrier-sync';

interface Setting {
  mailTransport: string | null;
  courrierAccountId: number | null;
}

export interface ReplySyncResult {
  users: number;
  checked: number;
  replied: number;
  failedUsers: number;
}

function courrierAccount(setting: Setting | null): number | null {
  return setting?.mailTransport === 'COURRIER' ? setting.courrierAccountId : null;
}

const settingSelect = { mailTransport: true, courrierAccountId: true } as const;

async function candidates(prisma: PrismaClient, since: Date) {
  const rows = await prisma.emailOutreach.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      sentAt: { gte: since },
      OR: [
        { courrierAccountId: { not: null } },
        { user: { mailTransport: 'COURRIER' } },
        { team: { mailTransport: 'COURRIER' } },
      ],
    },
    orderBy: { sentAt: 'asc' },
    select: {
      id: true,
      userId: true,
      teamId: true,
      companyId: true,
      personId: true,
      subject: true,
      sentAt: true,
      courrierAccountId: true,
      person: { select: { email: true, companyId: true } },
      lead: { select: { email: true } },
      user: { select: settingSelect },
      team: { select: settingSelect },
    },
  });
  return rows.flatMap((row) => {
    const email = (row.person?.email ?? row.lead?.email ?? '').trim().toLowerCase();
    const accountId =
      row.courrierAccountId ?? (row.team?.mailTransport ? courrierAccount(row.team) : courrierAccount(row.user));
    if (!email || accountId == null || !row.sentAt) return [];
    return [{ ...row, email, accountId, sentAt: row.sentAt, companyId: row.companyId ?? row.person?.companyId ?? null }];
  });
}

type Candidate = Awaited<ReturnType<typeof candidates>>[number];

async function recordReply(
  prisma: PrismaClient,
  row: Candidate,
  reply: { date: Date; messageId: string; subject: string }
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.emailOutreach.updateMany({
      where: { id: row.id, status: { in: [...OPEN_STATUSES] } },
      data: { status: 'REPLIED', repliedAt: reply.date },
    });
    if (claimed.count === 0) return false;
    if (row.personId) {
      await tx.person.updateMany({ where: { id: row.personId, stage: 'PROSPECT' }, data: { stage: 'CONTACTED' } });
    }
    if (row.companyId) {
      await tx.company.updateMany({ where: { id: row.companyId, stage: 'PROSPECT' }, data: { stage: 'CONTACTED' } });
    }
    if (row.personId || row.companyId) {
      await tx.activity.create({
        data: {
          userId: row.userId,
          teamId: row.teamId,
          companyId: row.companyId,
          personId: row.personId,
          kind: 'email.replied',
          summary: `Reply received: ${reply.subject || row.subject}`,
          payload: { outreachId: row.id, from: row.email, messageId: reply.messageId },
          actor: ACTOR,
          occurredAt: reply.date,
        },
      });
    }
    return true;
  });
}

async function syncUser(prisma: PrismaClient, courrier: ReplySource, rows: Candidate[], since: Date) {
  const searches = new Map<string, ReturnType<ReplySource['searchFrom']>>();
  let replied = 0;
  for (const row of rows) {
    const key = `${row.accountId}|${row.email}`;
    if (!searches.has(key)) searches.set(key, courrier.searchFrom(row.userId, row.accountId, row.email, since));
    const messages = await searches.get(key)!;
    const reply = messages.find((m) => m.date > row.sentAt);
    if (reply && (await recordReply(prisma, row, reply))) replied++;
  }
  return replied;
}

/**
 * Marks outreach as replied when the recipient wrote back. For every SENT,
 * OPENED or CLICKED outreach of the last 30 days that went out through
 * Courrier, or whose scope now sends through Courrier, it searches that
 * Courrier account for mail from the recipient after `sentAt`. One user's
 * failure is logged and never stops the others.
 */
export async function syncReplies(
  prisma: PrismaClient,
  courrier: ReplySource,
  now: Date = new Date()
): Promise<ReplySyncResult> {
  const since = new Date(now.getTime() - REPLY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const byUser = new Map<string, Candidate[]>();
  for (const row of await candidates(prisma, since)) {
    byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
  }

  const result: ReplySyncResult = { users: byUser.size, checked: 0, replied: 0, failedUsers: 0 };
  for (const [userId, rows] of byUser) {
    try {
      result.replied += await syncUser(prisma, courrier, rows, since);
      result.checked += rows.length;
    } catch (error) {
      result.failedUsers++;
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof CourrierReconnectError) {
        logger.info({ userId }, '[COURRIER] Reply sync skipped: the user must reconnect their Facile account');
      } else {
        logger.warn({ userId, error: message }, '[COURRIER] Reply sync failed for user');
      }
    }
  }
  return result;
}
