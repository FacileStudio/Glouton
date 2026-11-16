import type { Competitor, PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { complete } from '../assistant/bulle';
import { requireBulle } from '../assistant/service';
import { profileFor } from '../prospect/profile';
import { buildLeadFilter, type Scope } from '../../utils/scope';
import type { BattlecardDraft } from './prompt';
import { systemFor, type AiLanguage } from './prompt';
import {
  RECOMMEND_RULES,
  parseRecommendation,
  recommendInput,
  recommendSystemRule,
  type EventLine,
  type PriceLine,
  type Recommendation,
  type RecommendFacts,
} from './recommend';
import { aiError, requireAiAccess, type AiDeps } from './service';

const EVENTS_SHOWN = 20;
const PAGES_SHOWN = 2;

const priceSelect = { name: true, price: true, currency: true, unit: true, period: true } as const;

function lines(rows: Array<{ name: string; price: number | null; currency: string | null; unit: string | null; period: string | null }>): PriceLine[] {
  return rows.map((row) => ({ name: row.name, price: row.price, currency: row.currency, unit: row.unit, period: row.period?.toLowerCase() ?? null }));
}

async function countBy(prisma: PrismaClient, scope: Scope, competitorId: string) {
  const leads = buildLeadFilter(scope);
  const [won, lost, reasons] = await Promise.all([
    prisma.lead.count({ where: { ...leads, outcome: 'WON', wonAgainstCompetitorId: competitorId } }),
    prisma.lead.count({ where: { ...leads, outcome: 'LOST', lostToCompetitorId: competitorId } }),
    prisma.lead.groupBy({
      by: ['competitorLossReason'],
      where: { ...leads, outcome: 'LOST', lostToCompetitorId: competitorId },
      _count: { _all: true },
    }),
  ]);
  const lossReasons = Object.fromEntries(reasons.map((row) => [row.competitorLossReason ?? 'UNSPECIFIED', row._count._all]));
  return { won, lost, lossReasons };
}

/**
 * Gathers what a recommendation rests on, all from the database and never
 * from the client: the two newest price lists, the latest price events, the
 * space's own offer and prices, its win and loss record against the
 * competitor, the current battlecard and the latest text of the watched
 * pricing pages. Throws BAD_REQUEST while no price was ever read.
 */
export async function recommendFacts(prisma: PrismaClient, scope: Scope, competitor: Competitor): Promise<RecommendFacts> {
  const extractions = await prisma.priceExtraction.findMany({
    where: { competitorId: competitor.id },
    orderBy: { extractedAt: 'desc' },
    take: 2,
    select: { extractedAt: true, prices: { orderBy: { position: 'asc' }, select: priceSelect } },
  });
  const [current, previous] = extractions;
  if (!current) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Read the competitor prices first' });
  const [events, profile, record, pages] = await Promise.all([
    prisma.priceEvent.findMany({
      where: { competitorId: competitor.id },
      orderBy: { createdAt: 'desc' },
      take: EVENTS_SHOWN,
      select: { kind: true, plan: true, oldPrice: true, newPrice: true, percent: true, currency: true, createdAt: true },
    }),
    profileFor(prisma, scope),
    countBy(prisma, scope, competitor.id),
    prisma.watchedPage.findMany({
      where: { competitorId: competitor.id, kind: 'PRICING' },
      orderBy: { createdAt: 'asc' },
      take: PAGES_SHOWN,
      select: { url: true, snapshots: { orderBy: { fetchedAt: 'desc' }, take: 1, select: { text: true } } },
    }),
  ]);
  const battlecard: Partial<BattlecardDraft> = {
    overview: competitor.overview,
    whyWeWin: competitor.whyWeWin,
    whyWeLose: competitor.whyWeLose,
    landmines: competitor.landmines,
    pricing: competitor.pricing,
    proofPoints: competitor.proofPoints,
  };
  return {
    competitor: { name: competitor.name, website: competitor.website },
    current: { at: current.extractedAt.toISOString(), prices: lines(current.prices) },
    previous: previous ? { at: previous.extractedAt.toISOString(), prices: lines(previous.prices) } : null,
    events: events.map<EventLine>((event) => ({
      kind: event.kind,
      plan: event.plan,
      oldPrice: event.oldPrice,
      newPrice: event.newPrice,
      percent: event.percent,
      currency: event.currency,
      at: event.createdAt.toISOString(),
    })),
    own: { offer: profile.offerDescription, pricing: profile.ownPricing },
    record,
    battlecard,
    pages: pages.filter((page) => page.snapshots[0]).map((page) => ({ url: page.url, text: page.snapshots[0]!.text })),
  };
}

/**
 * Asks Bulle what a competitor's price move means and what to do about it.
 * The answer is validated whole, and its battlecard patch is only a
 * proposal: the web app applies it through competitor.update when the user
 * accepts it.
 */
export async function recommend(deps: AiDeps, scope: Scope, competitor: Competitor, language: AiLanguage): Promise<Recommendation> {
  const client = requireBulle(deps.bulle);
  const spaceId = await requireAiAccess(deps.forfait, scope);
  const facts = await recommendFacts(deps.prisma, scope, competitor);
  try {
    const raw = await complete(client, scope.userId, {
      system: systemFor(RECOMMEND_RULES, language, recommendSystemRule),
      prompt: 'Advise the team.',
      input: recommendInput(facts),
      maxTokens: 2000,
      spaceId,
    });
    return parseRecommendation(raw);
  } catch (error) {
    return aiError(error);
  }
}
