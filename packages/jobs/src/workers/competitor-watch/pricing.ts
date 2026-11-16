import type { PrismaClient } from '@prisma/client';
import { logger } from '@repo/logger';
import type { PriceChange, WatchDeps, WatchScope } from './run';

interface Page {
  id: string;
  kind: string;
  competitor: { id: string };
}

/** The id of the change a check just recorded on a page. */
async function latestChangeId(prisma: PrismaClient, pageId: string): Promise<string | null> {
  const row = await prisma.pageChange.findFirst({ where: { watchedPageId: pageId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  return row?.id ?? null;
}

/** Remembers the change a pricing page just recorded under its competitor. Other kinds of page are ignored. */
export async function notePricing(prisma: PrismaClient, page: Page, scope: WatchScope, into: Map<string, PriceChange>): Promise<void> {
  if (page.kind !== 'PRICING') return;
  const changeId = await latestChangeId(prisma, page.id);
  if (!changeId) return;
  const known = into.get(page.competitor.id);
  into.set(page.competitor.id, { scope, competitorId: page.competitor.id, changeIds: [...(known?.changeIds ?? []), changeId] });
}

/**
 * Hands each competitor whose pricing page changed to the price hook, once,
 * with every pricing change of the run. A hook that throws is logged and never
 * stops the run.
 */
export async function readChangedPrices(changed: Map<string, PriceChange>, hook: WatchDeps['onPriceChange']): Promise<void> {
  if (!hook) return;
  for (const change of changed.values()) {
    await hook(change).catch((error: unknown) => logger.warn({ err: error, competitorId: change.competitorId }, '[WATCH] Price extraction hook failed'));
  }
}
