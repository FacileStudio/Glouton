import type { Competitor, CompetitorPricePeriod, Prisma, PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { WebSearchError, type WebSearch } from '@repo/websearch';
import { RegistreReconnectError } from '@repo/courrier';
import { logger } from '@repo/logger';
import { PlanRequired, StatusError, complete, planRequired, type BulleClient } from '../assistant/bulle';
import { PLAN_REQUIRED_MESSAGE, assistantError, requireBulle } from '../assistant/service';
import { quotaKey } from '../competitor-discovery/sources';
import { cleanPageUrl } from '../competitor-watch/service';
import { AI_SUMMARIES_DAILY, limit } from '../forfait/features';
import { scopeValues, type ForfaitReader } from '../forfait/store';
import { profileFor } from '../prospect/profile';
import type { Scope } from '../../utils/scope';
import {
  AiOutputError,
  DRAFT_RULES,
  PRICE_RULES,
  SUMMARY_RULES,
  draftPrompt,
  parseDraft,
  parsePrices,
  parseSummaries,
  pricesPrompt,
  summaryPrompt,
  systemFor,
  type AiLanguage,
  type BattlecardDraft,
  type ChangeInput,
} from './prompt';

export interface AiDeps {
  prisma: PrismaClient;
  bulle: BulleClient | null;
  forfait: ForfaitReader;
  web?: Pick<WebSearch, 'fetch'> | null;
  now?: () => Date;
}

const EXTRA_PAGES = 2;
const SUMMARY_BATCH = 5;
const PRICE_SOURCES = 3;
const LINK = /\[([^\]]{0,120})\]\(([^)\s]{1,500})\)/g;
const PAGE_HINT = /(pric|tarif|prix|offre|offer|plan|abonnement|subscription|preise|precio|packages?|formules?)/i;

/** Whether an AI call in a scope is allowed, its upgrade link, and the Registre space Bulle checks the plan of. */
export interface AiScope {
  allowed: boolean;
  upgradeUrl: string;
  spaceId?: string;
}

/**
 * Whether an AI call in the scope is allowed: the person's own plan carries
 * ai.access, or, in a team they belong to, the team space's plan does. A
 * team call names the team's Registre space so Bulle applies the same rule.
 * True while plans are not enforced.
 */
export async function aiAccess(forfait: ForfaitReader, scope: Scope): Promise<AiScope> {
  if (scope.type === 'personal') {
    const own = await forfait.personal(scope.userId);
    return { allowed: Boolean(own.aiAccess), upgradeUrl: own.upgradeUrl };
  }
  const team = await forfait.team(scope.userId, scope.teamId);
  if (!team) return { allowed: false, upgradeUrl: '' };
  const allowed = Boolean(team.aiAccess) || Boolean((await forfait.personal(scope.userId)).aiAccess);
  return { allowed, upgradeUrl: team.upgradeUrl, spaceId: team.spaceId };
}

/** Refuses with the same plan_required shape Bulle's 402 has, before any quota is spent; returns the space Bulle checks. */
export async function requireAiAccess(forfait: ForfaitReader, scope: Scope): Promise<string | undefined> {
  const access = await aiAccess(forfait, scope);
  if (!access.allowed) assistantError(planRequired(PLAN_REQUIRED_MESSAGE, access.upgradeUrl));
  return access.spaceId;
}

/** Maps a model or web failure to the error the web app shows; plan and Bulle failures keep their cause. */
export function aiError(error: unknown): never {
  if (error instanceof AiOutputError) {
    throw new TRPCError({ code: 'UNPROCESSABLE_CONTENT', message: 'Bulle returned an unreadable answer. Try again.', cause: error });
  }
  if (error instanceof WebSearchError) {
    if (error.code === 'quota_exceeded') throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Daily web fetch quota reached', cause: error });
    if (error.code === 'invalid_input') throw new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
    throw new TRPCError({ code: 'BAD_GATEWAY', message: 'The competitor site could not be fetched', cause: error });
  }
  return assistantError(error);
}

function requireWeb(web: AiDeps['web']): Pick<WebSearch, 'fetch'> {
  if (!web) throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Web fetching is not configured on this server' });
  return web;
}

/** Same-host links of a fetched page whose text or path looks like pricing or offer pages, in page order. */
export function offerLinks(markdown: string, base: string): string[] {
  const origin = new URL(base);
  const found: string[] = [];
  for (const match of Array.from(markdown.matchAll(LINK))) {
    const [, label, href] = match;
    let url: URL;
    try {
      url = new URL(href!, origin);
    } catch {
      continue;
    }
    if (url.hostname !== origin.hostname || !/^https?:$/.test(url.protocol)) continue;
    if (!PAGE_HINT.test(`${label} ${url.pathname}`)) continue;
    url.hash = '';
    const clean = url.toString();
    if (clean !== origin.toString() && !found.includes(clean)) found.push(clean);
  }
  return found;
}

/** The homepage plus up to two pricing or offer pages: watched ones first, then links found on the homepage. */
async function fetchCompetitorPages(
  deps: AiDeps,
  scope: Scope,
  competitor: Competitor
): Promise<Array<{ url: string; text: string }>> {
  if (!competitor.website) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add the competitor website first' });
  const web = requireWeb(deps.web);
  const home = cleanPageUrl(competitor.website);
  const key = quotaKey(scope);
  const [homePage] = await web.fetch(key, [home]);
  const pages = [{ url: home, text: homePage?.markdown ?? '' }];
  const watched = await deps.prisma.watchedPage.findMany({
    where: { competitorId: competitor.id, kind: { in: ['PRICING', 'OFFER'] } },
    orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    select: { url: true },
  });
  const extra = Array.from(new Set([...watched.map((page) => page.url), ...offerLinks(pages[0]!.text, home)]))
    .filter((url) => url !== home)
    .slice(0, EXTRA_PAGES);
  if (extra.length > 0) {
    try {
      const fetched = await web.fetch(key, extra);
      for (const page of fetched) if (page.markdown.trim()) pages.push({ url: page.url, text: page.markdown });
    } catch (error) {
      logger.warn({ err: error, competitorId: competitor.id }, '[COMPETITOR_AI] Offer pages could not be fetched');
    }
  }
  if (!pages.some((page) => page.text.trim())) throw new TRPCError({ code: 'BAD_GATEWAY', message: 'The competitor site returned no text' });
  return pages;
}

/**
 * Drafts a battlecard from the competitor's homepage and offer pages. The
 * result is only a proposal: nothing is written, the web app shows it field
 * by field and the user accepts or discards each one.
 */
export async function draftBattlecard(
  deps: AiDeps,
  scope: Scope,
  competitor: Competitor,
  language: AiLanguage
): Promise<{ proposal: BattlecardDraft; sources: string[] }> {
  const client = requireBulle(deps.bulle);
  const spaceId = await requireAiAccess(deps.forfait, scope);
  try {
    const pages = await fetchCompetitorPages(deps, scope, competitor);
    const profile = await profileFor(deps.prisma, scope);
    const raw = await complete(client, scope.userId, {
      system: systemFor(DRAFT_RULES, language),
      prompt: 'Draft the battlecard.',
      input: draftPrompt(competitor, profile, pages),
      maxTokens: 2500,
      spaceId,
    });
    return { proposal: parseDraft(raw), sources: pages.map((page) => page.url) };
  } catch (error) {
    return aiError(error);
  }
}

function startOfDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const changeScope = (scope: { userId: string; teamId: string | null }): Prisma.PageChangeWhereInput => ({
  page: { competitor: scope.teamId ? { teamId: scope.teamId } : { userId: scope.userId, teamId: null } },
});

/** How many change summaries the scope tried today and may still try; attempts count, so a failing model is not retried all day. */
export async function summaryBudget(prisma: PrismaClient, scope: { userId: string; teamId: string | null }, now: Date) {
  const [used, plan] = await Promise.all([
    prisma.pageChange.count({ where: { ...changeScope(scope), aiSummaryAt: { gte: startOfDay(now) } } }),
    scopeValues(prisma, scope),
  ]);
  const max = limit(plan.enforced ? plan.values : null, AI_SUMMARIES_DAILY);
  return { used, limit: max, remaining: max === -1 ? Number.MAX_SAFE_INTEGER : Math.max(0, max - used) };
}

interface ChangeRow {
  id: string;
  diff: Prisma.JsonValue;
  changeRatio: number;
  page: { url: string; kind: string; competitor: { name: string } };
}

async function summarizeBatch(client: BulleClient, userId: string, spaceId: string | undefined, rows: ChangeRow[], language: AiLanguage) {
  const inputs: ChangeInput[] = rows.map((row, index) => ({
    label: `c${index + 1}`,
    competitorName: row.page.competitor.name,
    url: row.page.url,
    kind: row.page.kind,
    changePercent: Math.round(row.changeRatio * 1000) / 10,
    lines: Array.isArray(row.diff) ? (row.diff as Array<{ op: string; text: string }>) : [],
  }));
  const raw = await complete(client, userId, {
    system: systemFor(SUMMARY_RULES, language),
    prompt: 'Summarise each change.',
    input: summaryPrompt(inputs),
    maxTokens: 300 * rows.length + 200,
    spaceId,
  });
  const byLabel = parseSummaries(raw, inputs.map((input) => input.label));
  return rows.map((row, index) => ({ id: row.id, summary: byLabel.get(`c${index + 1}`)! }));
}

/**
 * Returns the cached AI summary of each given change of the scope, writing
 * missing ones through Bulle first. Only scopes with ai.access get any, and
 * at most the plan's daily number of new attempts (`glouton.ai_summaries_daily`).
 * A change is claimed before Bulle is asked, so two callers never pay for it
 * twice and a failed one waits until the next day.
 */
export async function summarizeChanges(
  deps: AiDeps,
  scope: { userId: string; teamId: string | null },
  changeIds: string[],
  language: AiLanguage
): Promise<{ available: boolean; summaries: Record<string, string> }> {
  const { prisma } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const where = { ...changeScope(scope), id: { in: changeIds } };
  const cachedRows = await prisma.pageChange.findMany({ where: { ...where, aiSummary: { not: null } }, select: { id: true, aiSummary: true } });
  const summaries: Record<string, string> = Object.fromEntries(cachedRows.map((row) => [row.id, row.aiSummary!]));
  const asScope: Scope = scope.teamId ? { type: 'team', userId: scope.userId, teamId: scope.teamId } : { type: 'personal', userId: scope.userId };
  const ai = await aiAccess(deps.forfait, asScope);
  if (!deps.bulle || !ai.allowed) return { available: false, summaries };

  const today = startOfDay(now);
  const { remaining } = await summaryBudget(prisma, scope, now);
  const open = await prisma.pageChange.findMany({
    where: { ...where, aiSummary: null, OR: [{ aiSummaryAt: null }, { aiSummaryAt: { lt: today } }] },
    orderBy: { createdAt: 'desc' },
    take: Math.min(remaining, changeIds.length),
    select: { id: true, diff: true, changeRatio: true, page: { select: { url: true, kind: true, competitor: { select: { name: true } } } } },
  });
  for (let start = 0; start < open.length; start += SUMMARY_BATCH) {
    const batch = open.slice(start, start + SUMMARY_BATCH);
    const claimed = await prisma.pageChange.updateMany({
      where: { id: { in: batch.map((row) => row.id) }, aiSummary: null, OR: [{ aiSummaryAt: null }, { aiSummaryAt: { lt: today } }] },
      data: { aiSummaryAt: now },
    });
    if (claimed.count !== batch.length) continue;
    try {
      for (const entry of await summarizeBatch(deps.bulle, scope.userId, ai.spaceId, batch, language)) {
        await prisma.pageChange.update({ where: { id: entry.id }, data: { aiSummary: entry.summary } });
        summaries[entry.id] = entry.summary;
      }
    } catch (error) {
      logger.warn({ err: error, scope }, '[COMPETITOR_AI] Change summaries failed');
      if (error instanceof PlanRequired || error instanceof RegistreReconnectError || error instanceof StatusError) break;
    }
  }
  return { available: true, summaries };
}

/** The language a background summary is written in: the scope owner's locale when supported, else French. */
export async function ownerLanguage(prisma: PrismaClient, userId: string): Promise<AiLanguage> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { locale: true } });
  const locale = user?.locale?.slice(0, 2);
  return locale === 'en' || locale === 'es' || locale === 'de' ? locale : 'fr';
}

/** The digest hook: summaries for the day's changes of one scope, keyed by change id; never throws. */
export function digestSummarizer(deps: AiDeps) {
  return async (scope: { userId: string; teamId: string | null }, changeIds: string[]): Promise<Map<string, string>> => {
    if (changeIds.length === 0) return new Map();
    try {
      const language = await ownerLanguage(deps.prisma, scope.userId);
      const { summaries } = await summarizeChanges(deps, scope, changeIds, language);
      return new Map(Object.entries(summaries));
    } catch (error) {
      logger.warn({ err: error }, '[COMPETITOR_AI] Digest summaries skipped');
      return new Map();
    }
  };
}

const PERIODS: Record<string, CompetitorPricePeriod> = {
  one_time: 'ONE_TIME',
  hour: 'HOUR',
  day: 'DAY',
  week: 'WEEK',
  month: 'MONTH',
  year: 'YEAR',
};

interface PriceSource {
  url: string;
  text: string;
  watchedPageId: string | null;
  snapshotId: string | null;
}

/** The latest snapshot of each watched pricing page; without any, the pricing page found on the homepage, fetched now. */
async function priceSources(deps: AiDeps, scope: Scope, competitor: Competitor): Promise<PriceSource[]> {
  const pages = await deps.prisma.watchedPage.findMany({
    where: { competitorId: competitor.id, kind: 'PRICING' },
    orderBy: { createdAt: 'asc' },
    take: PRICE_SOURCES,
    select: { id: true, url: true, snapshots: { orderBy: { fetchedAt: 'desc' }, take: 1, select: { id: true, text: true } } },
  });
  const stored = pages
    .filter((page) => page.snapshots[0])
    .map((page) => ({ url: page.url, text: page.snapshots[0]!.text, watchedPageId: page.id, snapshotId: page.snapshots[0]!.id }));
  if (stored.length > 0) return stored;
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
  extractedAt: true,
} as const;

/** The prices last extracted for a competitor, in page order. */
export function listPrices(prisma: PrismaClient, competitorId: string) {
  return prisma.competitorPrice.findMany({ where: { competitorId }, orderBy: { position: 'asc' }, select: priceSelect });
}

/**
 * Reads the prices on a competitor's pricing pages through Bulle and replaces
 * the competitor's price list with them. Bulle's answer is validated first,
 * so a bad answer leaves the previous list untouched.
 */
export async function extractPrices(deps: AiDeps, scope: Scope, competitor: Competitor, language: AiLanguage) {
  const client = requireBulle(deps.bulle);
  const spaceId = await requireAiAccess(deps.forfait, scope);
  let sources: PriceSource[];
  let prices: ReturnType<typeof parsePrices>;
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
  const now = (deps.now ?? (() => new Date()))();
  await deps.prisma.$transaction([
    deps.prisma.competitorPrice.deleteMany({ where: { competitorId: competitor.id } }),
    deps.prisma.competitorPrice.createMany({
      data: prices.map((entry, position) => {
        const source = sources[entry.source - 1]!;
        return {
          competitorId: competitor.id,
          watchedPageId: source.watchedPageId,
          snapshotId: source.snapshotId,
          name: entry.name,
          price: entry.price,
          currency: entry.currency,
          unit: entry.unit,
          period: entry.period ? PERIODS[entry.period] : null,
          sourceUrl: source.url,
          position,
          extractedAt: now,
        };
      }),
    }),
  ]);
  return listPrices(deps.prisma, competitor.id);
}

/** One stored snapshot of a competitor's watched page, or not found when it belongs to another competitor. */
export async function snapshotOf(prisma: PrismaClient, competitorId: string, snapshotId: string) {
  const snapshot = await prisma.pageSnapshot.findFirst({
    where: { id: snapshotId, page: { competitorId } },
    select: { id: true, text: true, fetchedAt: true, page: { select: { url: true } } },
  });
  if (!snapshot) throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
  return { id: snapshot.id, url: snapshot.page.url, text: snapshot.text, fetchedAt: snapshot.fetchedAt };
}
