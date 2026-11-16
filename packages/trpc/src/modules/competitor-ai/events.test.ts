import { describe, expect, test } from 'bun:test';
import { comparePrices, eventColumns, type PricePoint } from './events';

const plan = (name: string, price: number | null, patch: Partial<PricePoint> = {}): PricePoint => ({ name, price, currency: 'EUR', period: 'MONTH', ...patch });

describe('comparing two price extractions', () => {
  test('an unchanged list raises nothing', () => {
    const list = [plan('Starter', 49), plan('Pro', 99)];
    expect(comparePrices(list, list)).toEqual([]);
  });

  test('a price move carries old, new and the percent', () => {
    expect(comparePrices([plan('Pro', 99)], [plan('Pro', 109)])).toEqual([
      { type: 'price_changed', plan: 'Pro', old: 99, new: 109, percent: 10.1, currency: 'EUR', period: 'MONTH' },
    ]);
    expect(comparePrices([plan('Pro', 100)], [plan('Pro', 80)])[0]).toMatchObject({ percent: -20 });
  });

  test('sub-cent noise is not a change', () => {
    expect(comparePrices([plan('Pro', 99)], [plan('Pro', 99.001)])).toEqual([]);
  });

  test('a new plan is added and a missing plan is removed, removals last', () => {
    expect(comparePrices([plan('Starter', 49), plan('Pro', 99)], [plan('Starter', 49), plan('Team', 199)])).toEqual([
      { type: 'plan_added', plan: 'Team', price: 199, currency: 'EUR', period: 'MONTH' },
      { type: 'plan_removed', plan: 'Pro', price: 99, currency: 'EUR', period: 'MONTH' },
    ]);
  });

  test('a free plan that appears or leaves is a free tier event, not a plan event', () => {
    expect(comparePrices([plan('Pro', 99)], [plan('Free', 0), plan('Pro', 99)])).toEqual([
      { type: 'free_tier_appeared', plan: 'Free', currency: 'EUR', period: 'MONTH' },
    ]);
    expect(comparePrices([plan('Free', 0), plan('Pro', 99)], [plan('Pro', 99)])).toEqual([
      { type: 'free_tier_removed', plan: 'Free', currency: 'EUR', period: 'MONTH' },
    ]);
  });

  test('a plan that turns paid or free in place is a free tier event too', () => {
    expect(comparePrices([plan('Basic', 0)], [plan('Basic', 9)])).toEqual([
      { type: 'free_tier_removed', plan: 'Basic', currency: 'EUR', period: 'MONTH' },
    ]);
    expect(comparePrices([plan('Basic', 9)], [plan('Basic', 0)])).toEqual([
      { type: 'free_tier_appeared', plan: 'Basic', currency: 'EUR', period: 'MONTH' },
    ]);
  });

  test('names match without case, accents or spacing', () => {
    expect(comparePrices([plan('Équipe  Pro', 99)], [plan('equipe pro', 99)])).toEqual([]);
  });

  test('the same plan on two billing periods is two plans', () => {
    const before = [plan('Pro', 99), plan('Pro', 990, { period: 'YEAR' })];
    const after = [plan('Pro', 99), plan('Pro', 1090, { period: 'YEAR' })];
    expect(comparePrices(before, after)).toEqual([
      { type: 'price_changed', plan: 'Pro', old: 990, new: 1090, percent: 10.1, currency: 'EUR', period: 'YEAR' },
    ]);
  });

  test('duplicate names with one period pair up in page order', () => {
    expect(comparePrices([plan('Seat', 5), plan('Seat', 8)], [plan('Seat', 5), plan('Seat', 9)])).toEqual([
      { type: 'price_changed', plan: 'Seat', old: 8, new: 9, percent: 12.5, currency: 'EUR', period: 'MONTH' },
    ]);
  });

  test('a price that becomes a quote, or the reverse, is a change without a percent', () => {
    expect(comparePrices([plan('Enterprise', null)], [plan('Enterprise', 500)])[0]).toMatchObject({ type: 'price_changed', old: null, new: 500, percent: null });
    expect(comparePrices([plan('Enterprise', 500)], [plan('Enterprise', null)])[0]).toMatchObject({ old: 500, new: null, percent: null });
  });

  test('a currency switch has no percent', () => {
    expect(comparePrices([plan('Pro', 99)], [plan('Pro', 99, { currency: 'USD' })])[0]).toMatchObject({ type: 'price_changed', currency: 'USD', percent: null });
  });

  test('stored columns follow the event', () => {
    expect(eventColumns({ type: 'plan_added', plan: 'Team', price: 199, currency: 'EUR', period: 'MONTH' })).toMatchObject({ kind: 'PLAN_ADDED', oldPrice: null, newPrice: 199 });
    expect(eventColumns({ type: 'plan_removed', plan: 'Pro', price: 99, currency: 'EUR', period: null })).toMatchObject({ kind: 'PLAN_REMOVED', oldPrice: 99, newPrice: null });
    expect(eventColumns({ type: 'free_tier_appeared', plan: 'Free', currency: null, period: null })).toMatchObject({ kind: 'FREE_TIER_APPEARED', oldPrice: null, newPrice: null });
    expect(eventColumns({ type: 'price_changed', plan: 'Pro', old: 1, new: 2, percent: 100, currency: 'EUR', period: 'MONTH' })).toMatchObject({ kind: 'PRICE_CHANGED', percent: 100 });
  });
});
