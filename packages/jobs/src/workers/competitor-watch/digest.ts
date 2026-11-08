import type { PrismaClient } from '@prisma/client';
import type { Digest, DigestItem, WatchScope } from './run';

/** Lists the scope's changes not yet sent in a digest. */
export async function pendingItems(prisma: PrismaClient, scope: WatchScope): Promise<DigestItem[]> {
  const rows = await prisma.pageChange.findMany({
    where: { notifiedAt: null, page: { competitor: { userId: scope.teamId ? undefined : scope.userId, teamId: scope.teamId } } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      changeRatio: true,
      addedLines: true,
      removedLines: true,
      page: { select: { url: true, kind: true, competitor: { select: { id: true, name: true } } } },
    },
  });
  return rows.map((row) => ({
    changeId: row.id,
    competitorId: row.page.competitor.id,
    competitorName: row.page.competitor.name,
    url: row.page.url,
    kind: row.page.kind,
    changePercent: Math.round(row.changeRatio * 1000) / 10,
    added: row.addedLines,
    removed: row.removedLines,
  }));
}


/**
 * Sends one digest per scope with the changes no digest carried yet, plus the
 * pages the fetch quota skipped, and marks those changes as notified.
 * Returns how many digests went out.
 */
export async function deliverDigests(
  prisma: PrismaClient,
  scopes: Map<string, WatchScope>,
  quotaSkipped: Map<string, number>,
  now: Date,
  send?: (digest: Digest) => Promise<void>
): Promise<number> {
  let sent = 0;
  for (const [key, scope] of scopes) {
    const items = await pendingItems(prisma, scope);
    const skipped = quotaSkipped.get(key) ?? 0;
    if (items.length === 0 && skipped === 0) continue;
    await send?.({ scope, items, quotaSkipped: skipped });
    if (items.length > 0) {
      await prisma.pageChange.updateMany({ where: { id: { in: items.map((item) => item.changeId) } }, data: { notifiedAt: now } });
    }
    sent++;
  }
  return sent;
}
