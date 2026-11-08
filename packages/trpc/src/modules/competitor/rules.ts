import type { Prisma } from '@prisma/client';
import { objectionSchema, type CloseLeadInput, type Objection } from './schemas';

/** The win/loss columns a close writes on a lead; every other outcome column is cleared. */
export interface Closure {
  outcome: 'WON' | 'LOST';
  lossReason: CloseLeadInput['lossReason'] | null;
  lostToCompetitorId: string | null;
  competitorLossReason: CloseLeadInput['competitorLossReason'] | null;
  wonAgainstCompetitorId: string | null;
}

/** A close the rules refuse, with the field to point the user at. */
export class ClosureError extends Error {
  constructor(readonly field: 'lossReason' | 'lostToCompetitorId' | 'competitorLossReason') {
    super(`Closing this lead needs ${field}`);
    this.name = 'ClosureError';
  }
}

/**
 * Turns a close request into the columns to write. A win may name the
 * competitor it beat. A loss needs a reason; a loss to a competitor also
 * needs that competitor and why they won. Fields that do not apply to the
 * outcome are dropped so a lead never carries a stale competitor.
 */
export function closure(input: Omit<CloseLeadInput, 'leadId' | 'teamId'>): Closure {
  if (input.outcome === 'WON') {
    return {
      outcome: 'WON',
      lossReason: null,
      lostToCompetitorId: null,
      competitorLossReason: null,
      wonAgainstCompetitorId: input.wonAgainstCompetitorId ?? null,
    };
  }
  if (!input.lossReason) throw new ClosureError('lossReason');
  if (input.lossReason !== 'LOST_TO_COMPETITOR') {
    return { outcome: 'LOST', lossReason: input.lossReason, lostToCompetitorId: null, competitorLossReason: null, wonAgainstCompetitorId: null };
  }
  if (!input.lostToCompetitorId) throw new ClosureError('lostToCompetitorId');
  if (!input.competitorLossReason) throw new ClosureError('competitorLossReason');
  return {
    outcome: 'LOST',
    lossReason: 'LOST_TO_COMPETITOR',
    lostToCompetitorId: input.lostToCompetitorId,
    competitorLossReason: input.competitorLossReason,
    wonAgainstCompetitorId: null,
  };
}

/** Deals won and lost against one competitor, and the share won, or null with no closed deal. */
export interface WinRate {
  won: number;
  lost: number;
  total: number;
  rate: number | null;
}

/** The win rate from closed-deal counts, as a 0-100 percentage rounded to one decimal. */
export function winRate(won: number, lost: number): WinRate {
  const total = won + lost;
  return { won, lost, total, rate: total === 0 ? null : Math.round((won / total) * 1000) / 10 };
}

/** Lowercases a website or URL down to its host without `www.`, for matching competitors by domain. */
export function domainOf(website: string | null | undefined): string | null {
  const raw = website?.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** Reads stored objections, dropping any entry that no longer matches the schema. */
export function objectionsOf(value: Prisma.JsonValue): Objection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = objectionSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Deduplicates tags case-insensitively, keeping the first spelling. */
export function cleanTags(tags: string[] | undefined): string[] | undefined {
  if (!tags) return undefined;
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
