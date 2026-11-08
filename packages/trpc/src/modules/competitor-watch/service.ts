import type { Prisma, PrismaClient, WatchedPageKind } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { WebSearchError, cleanUrls } from '@repo/websearch';
import { buildCompetitorFilter, type Scope } from '../../utils/scope';
import { LimitError, WATCHED_PAGES, check, limit } from '../forfait/features';
import { limitReached } from '../forfait/gate';
import { scopeValues } from '../forfait/store';

/** One line of a stored diff, as the worker writes it. */
export interface DiffLine {
  op: '+' | '-' | ' ';
  text: string;
}

/** The fields an add or an update may write, as the router parsed them. */
export interface PageFields {
  url?: string;
  selector?: string | null;
  kind?: WatchedPageKind;
  thresholdPct?: number;
  enabled?: boolean;
}

const SELECTOR = /^[^\u0000-\u001f]{1,200}$/;

const notFound = () => new TRPCError({ code: 'NOT_FOUND', message: 'Watched page not found' });

const scopeOf = (scope: Scope) => ({ userId: scope.userId, teamId: scope.type === 'team' ? scope.teamId : null });

/** Accepts a public http(s) URL, adding https:// when the scheme is missing; the fragment is dropped. */
export function cleanPageUrl(raw: string): string {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
  try {
    const [url] = cleanUrls([withScheme]);
    const parsed = new URL(url!);
    parsed.hash = '';
    return parsed.toString();
  } catch (error) {
    const message = error instanceof WebSearchError ? error.message : 'invalid url';
    throw new TRPCError({ code: 'BAD_REQUEST', message });
  }
}

/** An empty selector means the whole page; anything else must fit websearch's selector rules. */
export function cleanSelector(raw: string | null | undefined): string | null {
  const selector = raw?.trim() ?? '';
  if (!selector) return null;
  if (!SELECTOR.test(selector)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'invalid selector' });
  return selector;
}

/** How many pages the scope watches, and how many its plan allows (-1 is unlimited, null while not enforced). */
export async function pageUsage(prisma: PrismaClient, scope: Scope) {
  const [used, plan] = await Promise.all([
    prisma.watchedPage.count({ where: { competitor: buildCompetitorFilter(scope) } }),
    scopeValues(prisma, scopeOf(scope)),
  ]);
  return { used, limit: plan.enforced ? limit(plan.values, WATCHED_PAGES) : null };
}

/** A competitor's watched pages with their unseen change counts, and the scope's page usage. */
export async function listPages(prisma: PrismaClient, scope: Scope, competitorId: string) {
  const [pages, usage] = await Promise.all([
    prisma.watchedPage.findMany({
      where: { competitorId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        url: true,
        selector: true,
        kind: true,
        enabled: true,
        thresholdPct: true,
        lastCheckedAt: true,
        lastStatus: true,
        createdAt: true,
        _count: { select: { changes: { where: { seen: false } } } },
      },
    }),
    pageUsage(prisma, scope),
  ]);
  return {
    pages: pages.map(({ _count, ...page }) => ({ ...page, unseen: _count.changes })),
    usage,
  };
}

/** Refuses a page that the competitor already watches with the same selector. */
async function ensureUnique(prisma: PrismaClient, competitorId: string, url: string, selector: string | null, exceptId?: string) {
  const twin = await prisma.watchedPage.findFirst({
    where: { competitorId, url, selector, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (twin) throw new TRPCError({ code: 'CONFLICT', message: 'This page is already watched' });
}

/** Adds a watched page to a competitor, inside the scope's plan limit. */
export async function addPage(prisma: PrismaClient, scope: Scope, competitorId: string, fields: PageFields & { url: string }) {
  const url = cleanPageUrl(fields.url);
  const selector = cleanSelector(fields.selector);
  const plan = await scopeValues(prisma, scopeOf(scope));
  if (plan.enforced) {
    const used = await prisma.watchedPage.count({ where: { competitor: buildCompetitorFilter(scope) } });
    try {
      check(plan.values, WATCHED_PAGES, used, 1, plan.upgradeUrl);
    } catch (error) {
      if (error instanceof LimitError) throw limitReached(error);
      throw error;
    }
  }
  await ensureUnique(prisma, competitorId, url, selector);
  return prisma.watchedPage.create({
    data: {
      competitorId,
      url,
      selector,
      kind: fields.kind ?? 'OTHER',
      thresholdPct: fields.thresholdPct ?? 5,
      enabled: fields.enabled ?? true,
    },
  });
}

/** Loads one page of a competitor, or not found when it belongs to another one. */
async function pageOf(prisma: PrismaClient, competitorId: string, pageId: string) {
  const page = await prisma.watchedPage.findFirst({ where: { id: pageId, competitorId } });
  if (!page) throw notFound();
  return page;
}

/** Edits a watched page. A new URL or selector starts a fresh baseline, since the old snapshots no longer compare. */
export async function updatePage(prisma: PrismaClient, competitorId: string, pageId: string, fields: PageFields) {
  const page = await pageOf(prisma, competitorId, pageId);
  const url = fields.url !== undefined ? cleanPageUrl(fields.url) : page.url;
  const selector = fields.selector !== undefined ? cleanSelector(fields.selector) : page.selector;
  const moved = url !== page.url || selector !== page.selector;
  if (moved) await ensureUnique(prisma, competitorId, url, selector, page.id);
  const data: Prisma.WatchedPageUncheckedUpdateInput = { url, selector };
  if (fields.kind !== undefined) data.kind = fields.kind;
  if (fields.thresholdPct !== undefined) data.thresholdPct = fields.thresholdPct;
  if (fields.enabled !== undefined) data.enabled = fields.enabled;
  if (moved) {
    data.lastCheckedAt = null;
    data.lastStatus = null;
  }
  return prisma.$transaction(async (tx) => {
    if (moved) await tx.pageSnapshot.deleteMany({ where: { watchedPageId: page.id } });
    return tx.watchedPage.update({ where: { id: page.id }, data });
  });
}

/** Removes a watched page with its snapshots and changes. */
export async function removePage(prisma: PrismaClient, competitorId: string, pageId: string) {
  const page = await pageOf(prisma, competitorId, pageId);
  await prisma.watchedPage.delete({ where: { id: page.id } });
  return { success: true };
}

/** A competitor's recorded changes, newest first, with the page each one is on. */
export async function listChanges(prisma: PrismaClient, competitorId: string, options: { pageId?: string; limit: number }) {
  const rows = await prisma.pageChange.findMany({
    where: { page: { competitorId }, ...(options.pageId ? { watchedPageId: options.pageId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: options.limit,
    select: {
      id: true,
      diff: true,
      changeRatio: true,
      addedLines: true,
      removedLines: true,
      seen: true,
      aiSummary: true,
      createdAt: true,
      page: { select: { id: true, url: true, kind: true, selector: true } },
    },
  });
  return rows.map((row) => ({ ...row, diff: (Array.isArray(row.diff) ? row.diff : []) as unknown as DiffLine[] }));
}

/** Marks a competitor's changes as seen: the given ones, or all of them. */
export async function markSeen(prisma: PrismaClient, competitorId: string, changeIds?: string[]) {
  const result = await prisma.pageChange.updateMany({
    where: { page: { competitorId }, seen: false, ...(changeIds ? { id: { in: changeIds } } : {}) },
    data: { seen: true },
  });
  return { updated: result.count };
}

/** Unseen change counts per competitor of a scope; competitors with none are left out. */
export async function unseenCounts(prisma: PrismaClient, scope: Scope): Promise<Record<string, number>> {
  const pages = await prisma.watchedPage.findMany({
    where: { competitor: buildCompetitorFilter(scope), changes: { some: { seen: false } } },
    select: { competitorId: true, _count: { select: { changes: { where: { seen: false } } } } },
  });
  const counts: Record<string, number> = {};
  for (const page of pages) counts[page.competitorId] = (counts[page.competitorId] ?? 0) + page._count.changes;
  return counts;
}
