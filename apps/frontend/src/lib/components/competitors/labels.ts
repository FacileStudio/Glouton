import type { trpc } from '$lib/trpc';

export type CompetitorList = Awaited<ReturnType<typeof trpc.competitor.list.query>>;
export type CompetitorItem = CompetitorList['items'][number];
export type CompetitorCard = Awaited<ReturnType<typeof trpc.competitor.get.query>>;
export type Objection = { objection: string; response: string; proof: string };
export type WinRate = { won: number; lost: number; total: number; rate: number | null };

export const LOSS_REASONS = ['LOST_TO_COMPETITOR', 'PRICE', 'NO_DECISION', 'NO_BUDGET', 'TIMING', 'FEATURES', 'OTHER'] as const;
export const COMPETITOR_LOSS_REASONS = ['PRICE', 'FEATURES', 'RELATIONSHIP', 'BRAND', 'TIMING', 'OTHER'] as const;

export type LossReason = (typeof LOSS_REASONS)[number];
export type CompetitorLossReason = (typeof COMPETITOR_LOSS_REASONS)[number];

export const LIST_SECTIONS = ['whyWeWin', 'whyWeLose', 'landmines', 'proofPoints'] as const;
export type ListSection = (typeof LIST_SECTIONS)[number];

/** Below this many closed deals a win rate is shown with a caution. */
export const SMALL_SAMPLE = 5;

/** The win rate as a whole percentage, or null when no deal is closed. */
export function ratePercent(rate: WinRate): string | null {
  return rate.rate === null ? null : `${Math.round(rate.rate)} %`;
}

/** The badge tone for a win rate: good above 60 %, poor below 40 %. */
export function rateTone(rate: WinRate): 'success' | 'danger' | 'warning' | 'neutral' {
  if (rate.rate === null) return 'neutral';
  if (rate.rate >= 60) return 'success';
  if (rate.rate < 40) return 'danger';
  return 'warning';
}

/** Splits a comma-separated field into trimmed, non-empty entries. */
export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** A lead's display name from whatever identifies it. */
export function leadName(lead: { businessName: string | null; domain: string | null; firstName: string | null; lastName: string | null }): string {
  const person = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
  return lead.businessName || person || lead.domain || '?';
}
