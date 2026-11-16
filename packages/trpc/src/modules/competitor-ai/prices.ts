import type { Competitor, CompetitorPricePeriod, PrismaClient } from '@prisma/client';
import { complete } from '../assistant/bulle';
import { requireBulle } from '../assistant/service';
import type { Scope } from '../../utils/scope';
import { comparePrices, eventColumns, type PricePoint } from './events';
import {
  PRICE_RULES,
  parsePrices,
  pricesPrompt,
  systemFor,
  type AiLanguage,
  type ExtractedPrice,
} from './prompt';
import { aiError, fetchCompetitorPages, requireAiAccess, type AiDeps } from './service';

const PRICE_SOURCES = 3;

const PERIODS: Record<string, CompetitorPricePeriod> = {
  one_time: 'ONE_TIME',
  hour: 'HOUR',
  day: 'DAY',
  week: 'WEEK',
  month: 'MONTH',
  year: 'YEAR',
};

export interface PriceSource {
  url: string;
  text: string;
  watchedPageId: string | null;
  snapshotId: string | null;
}

/** The latest snapshot of each watched pricing page; without any, the pricing page found on the homepage, fetched now unless storedOnly. */
export async function priceSources(deps: AiDeps, scope: Scope, competitor: Competitor, storedOnly = false): Promise<PriceSource[]> {
  const pages = await deps.prisma.watchedPage.findMany({
    where: { competitorId: competitor.id, kind: 'PRICING' },
    orderBy: { createdAt: 'asc' },
    take: PRICE_SOURCES,
    select: { id: true, url: true, snapshots: { orderBy: { fetchedAt: 'desc' }, take: 1, select: { id: true, text: true } } },
  });
  const stored = pages
    .filter((page) => page.snapshots[0])
    .map((page) => ({ url: page.url, text: page.snapshots[0]!.text, watchedPageId: page.id, snapshotId: page.snapshots[0]!.id }));
  if (stored.length > 0 || storedOnly) return stored;
  const fetched = await fetchCompetitorPages(deps, scope, competitor);
  const pricing = fetched.slice(1);
  return (pricing.length > 0 ? pricing : fetched.slice(0, 1)).map((page) => ({ ...page, watchedPageId: null, snapshotId: null }));
}

const priceSelect = {
  id: true,
  name: true,
  price: true,
  currency: true,
  unit: true,
  period: true,
  sourceUrl: true,
  snapshotId: true,
  extractionId: true,
  extractedAt: true,
} as const;

/**
 * The prices of the newest extraction in page order. Rows written before
 * history was kept have no extraction and read as the list while none exists.
 */
export async function listPrices(prisma: PrismaClient, competitorId: string) {
  const latest = await prisma.priceExtraction.findFirst({ where: { competitorId }, orderBy: { extractedAt: 'desc' }, select: { id: true } });
  return prisma.competitorPrice.findMany({
    where: { competitorId, extractionId: latest?.id ?? null },
    orderBy: { position: 'asc' },
    select: priceSelect,
  });
}

function pointsOf(rows: Array<{ name: string; price: number | null; currency: string | null; period: string | null }>): PricePoint[] {
  return rows.map((row) => ({ name: row.name, price: row.price, currency: row.currency, period: row.period }));
}

/** How a stored extraction started. */
export type ExtractionTrigger = 'manual' | 'watch';

/**
 * Stores one extraction next to the earlier ones and the events against the
 * newest earlier list. The first list, or one after an empty list, has no
 * events: nothing to compare. Extraction, prices and events go in together.
 */
export async function storeExtraction(
  prisma: PrismaClient,
  competitorId: string,
  sources: PriceSource[],
  prices: ExtractedPrice[],
  trigger: ExtractionTrigger,
  changeId: string | null,
  now: Date
) {
  const rows = prices.map((entry, position) => {
    const source = sources[entry.source - 1]!;
    return {
      competitorId,
      watchedPageId: source.watchedPageId,
      snapshotId: source.snapshotId,
      name: entry.name,
      price: entry.price,
      currency: entry.currency,
      unit: entry.unit,
      period: entry.period ? PERIODS[entry.period]! : null,
      sourceUrl: source.url,
      position,
      extractedAt: now,
    };
  });
  const before = pointsOf(await listPrices(prisma, competitorId));
  const events = before.length > 0 ? comparePrices(before, pointsOf(rows)) : [];
  const created = await prisma.priceExtraction.create({
    data: {
      competitorId,
      trigger,
      changeId,
      extractedAt: now,
      prices: { create: rows },
      events: { create: events.map((event) => ({ competitorId, createdAt: now, ...eventColumns(event) })) },
    },
    select: { id: true },
  });
  return { id: created.id, events: events.length };
}

/**
 * Reads the prices on a competitor's pricing pages through Bulle and stores
 * them as the newest extraction; earlier ones stay as history. Bulle's
 * answer is validated first, so a bad answer stores nothing.
 */
export async function extractPrices(deps: AiDeps, scope: Scope, competitor: Competitor, language: AiLanguage) {
  const client = requireBulle(deps.bulle);
  const spaceId = await requireAiAccess(deps.forfait, scope);
  let sources: PriceSource[];
  let prices: ExtractedPrice[];
  try {
    sources = await priceSources(deps, scope, competitor);
    const raw = await complete(client, scope.userId, {
      system: systemFor(PRICE_RULES, language),
      prompt: 'List the prices.',
      input: pricesPrompt(competitor.name, sources),
      maxTokens: 2000,
      spaceId,
    });
    prices = parsePrices(raw, sources.length);
  } catch (error) {
    return aiError(error);
  }
  await storeExtraction(deps.prisma, competitor.id, sources, prices, 'manual', null, (deps.now ?? (() => new Date()))());
  return listPrices(deps.prisma, competitor.id);
}

/** The extractions of a competitor, newest first, each with its prices and the events it raised. */
export function priceTimeline(prisma: PrismaClient, competitorId: string, limit: number) {
  return prisma.priceExtraction.findMany({
    where: { competitorId },
    orderBy: { extractedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      trigger: true,
      changeId: true,
      extractedAt: true,
      prices: { orderBy: { position: 'asc' }, select: priceSelect },
      events: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, kind: true, plan: true, oldPrice: true, newPrice: true, currency: true, period: true, percent: true, createdAt: true },
      },
    },
  });
}
