import type { CompetitorPricePeriod } from '@prisma/client';

/** One price as an extraction stores it. */
export interface PricePoint {
  name: string;
  price: number | null;
  currency: string | null;
  period: string | null;
}

/** What moved between two extractions of a competitor's prices. */
export type PriceEventData =
  | { type: 'price_changed'; plan: string; old: number | null; new: number | null; percent: number | null; currency: string | null; period: string | null }
  | { type: 'plan_added'; plan: string; price: number | null; currency: string | null; period: string | null }
  | { type: 'plan_removed'; plan: string; price: number | null; currency: string | null; period: string | null }
  | { type: 'free_tier_appeared'; plan: string; currency: string | null; period: string | null }
  | { type: 'free_tier_removed'; plan: string; currency: string | null; period: string | null };

const EPSILON = 0.005;

function planKey(point: PricePoint): string {
  const name = point.name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return `${name}|${point.period ?? ''}`;
}

function index(points: PricePoint[]): Map<string, PricePoint> {
  const byKey = new Map<string, PricePoint>();
  for (const point of points) {
    let key = planKey(point);
    for (let copy = 2; byKey.has(key); copy++) key = `${planKey(point)}#${copy}`;
    byKey.set(key, point);
  }
  return byKey;
}

const isFree = (point: PricePoint) => point.price === 0;

function percentChange(from: number, to: number): number {
  return Math.round(((to - from) / from) * 1000) / 10;
}

function changed(before: PricePoint, after: PricePoint): PriceEventData | null {
  if (before.price === after.price && before.currency === after.currency) return null;
  const meta = { plan: after.name, currency: after.currency, period: after.period };
  if (isFree(before) && !isFree(after) && after.price !== null) return { type: 'free_tier_removed', plan: after.name, currency: after.currency, period: after.period };
  if (!isFree(before) && isFree(after) && before.price !== null) return { type: 'free_tier_appeared', plan: after.name, currency: after.currency, period: after.period };
  const sameCurrency = before.currency === after.currency;
  if (before.price !== null && after.price !== null && sameCurrency && Math.abs(before.price - after.price) < EPSILON) return null;
  const percent = before.price !== null && after.price !== null && sameCurrency && before.price !== 0 ? percentChange(before.price, after.price) : null;
  return { type: 'price_changed', ...meta, old: before.price, new: after.price, percent };
}

/**
 * Compares two extractions of one competitor. Plans match on their name
 * (case, accents and spacing ignored) and billing period. A plan only in
 * the new list is added, one only in the old list is removed; a plan priced
 * 0 that appears or turns paid is a free tier event instead. Two plans with
 * the same name and period pair up in page order. Events come in the order
 * of the new list, removals last.
 */
export function comparePrices(previous: PricePoint[], next: PricePoint[]): PriceEventData[] {
  const before = index(previous);
  const after = index(next);
  const events: PriceEventData[] = [];
  for (const [key, point] of after) {
    const old = before.get(key);
    if (!old) {
      events.push(
        isFree(point)
          ? { type: 'free_tier_appeared', plan: point.name, currency: point.currency, period: point.period }
          : { type: 'plan_added', plan: point.name, price: point.price, currency: point.currency, period: point.period }
      );
      continue;
    }
    const event = changed(old, point);
    if (event) events.push(event);
  }
  for (const [key, point] of before) {
    if (after.has(key)) continue;
    events.push(
      isFree(point)
        ? { type: 'free_tier_removed', plan: point.name, currency: point.currency, period: point.period }
        : { type: 'plan_removed', plan: point.name, price: point.price, currency: point.currency, period: point.period }
    );
  }
  return events;
}

const KINDS = {
  price_changed: 'PRICE_CHANGED',
  plan_added: 'PLAN_ADDED',
  plan_removed: 'PLAN_REMOVED',
  free_tier_appeared: 'FREE_TIER_APPEARED',
  free_tier_removed: 'FREE_TIER_REMOVED',
} as const;

export type PriceEventKindName = (typeof KINDS)[PriceEventData['type']];

/** The columns of a stored PriceEvent for one event. */
export function eventColumns(event: PriceEventData) {
  const base = { kind: KINDS[event.type], plan: event.plan, currency: event.currency, period: event.period as CompetitorPricePeriod | null };
  switch (event.type) {
    case 'price_changed':
      return { ...base, oldPrice: event.old, newPrice: event.new, percent: event.percent };
    case 'plan_added':
      return { ...base, oldPrice: null, newPrice: event.price, percent: null };
    case 'plan_removed':
      return { ...base, oldPrice: event.price, newPrice: null, percent: null };
    default:
      return { ...base, oldPrice: null, newPrice: null, percent: null };
  }
}
