import { RegistreReconnectError } from '@repo/courrier';
import { logger } from '@repo/logger';
import { PlanRequired, StatusError, TOKEN_EXCHANGE_FAILED, UnreachableError, complete } from '../assistant/bulle';
import type { Scope } from '../../utils/scope';
import { priceSources, storeExtraction } from './prices';
import { AiOutputError, PRICE_RULES, parsePrices, pricesPrompt, systemFor } from './prompt';
import { aiAccess, changeScope, ownerLanguage, startOfDay, type AiDeps } from './service';

/** Automatic extractions a scope may start per UTC day, whatever its plan; Bulle's own daily cap applies on top. */
export const AUTO_PRICE_DAILY = 10;

/** What the automatic extraction did for one change, stored as `PageChange.priceStatus`. */
export type AutoPriceStatus =
  | 'extracted'
  | 'skipped_bulle_off'
  | 'skipped_no_ai_access'
  | 'skipped_no_token'
  | 'skipped_plan_limit'
  | 'skipped_daily_cap'
  | 'skipped_budget'
  | 'skipped_already_attempted'
  | 'failed_no_page_text'
  | 'failed_bad_output'
  | 'failed_unreachable'
  | 'failed_other';

/** The pricing page changes of one competitor a run noticed, with the scope that owns them. */
export interface PriceChangeTarget {
  scope: { userId: string; teamId: string | null };
  competitorId: string;
  changeIds: string[];
}

const BLOCKS_THE_DAY = new Set<AutoPriceStatus>(['skipped_no_token', 'skipped_plan_limit', 'skipped_daily_cap', 'skipped_no_ai_access']);

/** Maps a failed Bulle call to the status recorded on the change. */
export function failureStatus(error: unknown): AutoPriceStatus {
  if (error instanceof PlanRequired) return 'skipped_plan_limit';
  if (error instanceof RegistreReconnectError) return 'skipped_no_token';
  if (error instanceof StatusError && error.status === 429) return 'skipped_daily_cap';
  if (error instanceof AiOutputError) return 'failed_bad_output';
  if (error instanceof UnreachableError || error instanceof StatusError) {
    return error.message.includes(TOKEN_EXCHANGE_FAILED) ? 'skipped_no_token' : 'failed_unreachable';
  }
  return 'failed_other';
}

/**
 * The hook the competitor watch calls after a pricing page changed: reads
 * the new prices through Bulle as the page owner and stores them, which
 * raises the price events the digest then carries. It never throws and
 * never retries: one attempt per change, claimed before Bulle is asked.
 * Without Bulle, without ai.access for the scope, without a usable Registre
 * token, over the scope's daily budget, or after Bulle answered a plan limit
 * or its daily cap, it skips and records why on the changes. A refusal that
 * belongs to the person (no token, plan, cap) also skips their later
 * competitors for the rest of the UTC day.
 */
export function autoPriceExtractor(deps: AiDeps) {
  const blocked = new Map<string, AutoPriceStatus>();
  const clock = deps.now ?? (() => new Date());

  const record = async (target: PriceChangeTarget, status: AutoPriceStatus): Promise<AutoPriceStatus> => {
    await deps.prisma.pageChange.updateMany({ where: { id: { in: target.changeIds } }, data: { priceStatus: status } });
    return status;
  };

  const attempt = async (target: PriceChangeTarget, scope: Scope, now: Date): Promise<AutoPriceStatus> => {
    const { prisma } = deps;
    if (!deps.bulle) return 'skipped_bulle_off';
    const access = await aiAccess(deps.forfait, scope);
    if (!access.allowed) return 'skipped_no_ai_access';
    const used = await prisma.pageChange.count({ where: { ...changeScope(target.scope), priceAttemptAt: { gte: startOfDay(now) } } });
    if (used >= AUTO_PRICE_DAILY) return 'skipped_budget';
    const claimed = await prisma.pageChange.updateMany({ where: { id: { in: target.changeIds }, priceAttemptAt: null }, data: { priceAttemptAt: now } });
    if (claimed.count === 0) return 'skipped_already_attempted';
    const competitor = await prisma.competitor.findFirst({ where: { id: target.competitorId, userId: target.scope.userId, teamId: target.scope.teamId } });
    if (!competitor) return 'failed_other';
    const sources = await priceSources(deps, scope, competitor, true);
    if (sources.length === 0) return 'failed_no_page_text';
    const raw = await complete(deps.bulle, scope.userId, {
      system: systemFor(PRICE_RULES, await ownerLanguage(prisma, scope.userId)),
      prompt: 'List the prices.',
      input: pricesPrompt(competitor.name, sources),
      maxTokens: 2000,
      spaceId: access.spaceId,
    });
    await storeExtraction(prisma, competitor.id, sources, parsePrices(raw, sources.length), 'watch', target.changeIds[0] ?? null, now);
    return 'extracted';
  };

  return async (target: PriceChangeTarget): Promise<AutoPriceStatus> => {
    const now = clock();
    const scope: Scope = target.scope.teamId
      ? { type: 'team', userId: target.scope.userId, teamId: target.scope.teamId }
      : { type: 'personal', userId: target.scope.userId };
    const day = `${target.scope.userId}:${target.scope.teamId ?? ''}:${startOfDay(now).toISOString()}`;
    const earlier = blocked.get(day);
    if (earlier) return record(target, earlier);
    let status: AutoPriceStatus;
    try {
      status = await attempt(target, scope, now);
    } catch (error) {
      status = failureStatus(error);
      if (status === 'failed_other') logger.warn({ err: error, competitorId: target.competitorId }, '[COMPETITOR_AI] Automatic price extraction failed');
    }
    if (BLOCKS_THE_DAY.has(status)) blocked.set(day, status);
    return record(target, status).catch((error: unknown) => {
      logger.warn({ err: error }, '[COMPETITOR_AI] Could not record the price extraction status');
      return status;
    });
  };
}
