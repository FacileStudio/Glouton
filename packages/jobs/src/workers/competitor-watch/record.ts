import type { Prisma, PrismaClient } from '@prisma/client';
import { diffText } from './diff';
import { hashText, normalizeText } from './normalize';
import { CHANGES_KEPT, SNAPSHOTS_KEPT, type CheckStatus } from './run';

interface Page {
  id: string;
  thresholdPct: number;
}

/** Deletes the snapshots and changes of one page past the retention counts. */
export async function prune(prisma: PrismaClient, pageId: string): Promise<void> {
  const oldSnapshots = await prisma.pageSnapshot.findMany({
    where: { watchedPageId: pageId },
    orderBy: { fetchedAt: 'desc' },
    skip: SNAPSHOTS_KEPT,
    select: { id: true },
  });
  if (oldSnapshots.length > 0) await prisma.pageSnapshot.deleteMany({ where: { id: { in: oldSnapshots.map((row) => row.id) } } });
  const oldChanges = await prisma.pageChange.findMany({
    where: { watchedPageId: pageId },
    orderBy: { createdAt: 'desc' },
    skip: CHANGES_KEPT,
    select: { id: true },
  });
  if (oldChanges.length > 0) await prisma.pageChange.deleteMany({ where: { id: { in: oldChanges.map((row) => row.id) } } });
}

/** Compares freshly fetched markdown with the page's last snapshot and records what moved. */
export async function recordFetch(prisma: PrismaClient, page: Page, markdown: string, now: Date): Promise<CheckStatus> {
  const text = normalizeText(markdown);
  if (!text) return 'empty';
  const hash = hashText(text);
  const last = await prisma.pageSnapshot.findFirst({
    where: { watchedPageId: page.id },
    orderBy: { fetchedAt: 'desc' },
    select: { text: true, hash: true },
  });
  if (last?.hash === hash) return 'unchanged';
  await prisma.pageSnapshot.create({ data: { watchedPageId: page.id, text, hash, fetchedAt: now } });
  if (!last) return 'baseline';
  const diff = diffText(last.text, text);
  if (diff.ratio * 100 < page.thresholdPct) return 'minor';
  await prisma.pageChange.create({
    data: {
      watchedPageId: page.id,
      diff: diff.lines as unknown as Prisma.InputJsonValue,
      changeRatio: diff.ratio,
      addedLines: diff.added,
      removedLines: diff.removed,
      createdAt: now,
    },
  });
  return 'changed';
}

