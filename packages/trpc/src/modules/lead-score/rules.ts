import { auditGaps, employeeCount, isRecord } from './audit';
import { FACTORS, WEIGHTS, reason, type FitReason, type FitScore } from './reason';
import { areaReason, targetReason } from './target';

export { FACTORS, WEIGHTS, type Factor, type FitReason, type FitScore } from './reason';

/** What the score reads of a lead. */
export interface ScoreLead {
  category: string | null;
  businessName: string | null;
  city: string | null;
  country: string | null;
  hasWebsite: boolean;
  email: string | null;
  emailVerified: boolean | null;
  phoneNumbers: string[];
  websiteAudit: unknown;
  scrapedAt: Date | null;
  auditedAt: Date | null;
  createdAt: Date;
  contacted: boolean;
  lastContactedAt: Date | null;
  emailsSentCount: number;
}

/** What the space says it looks for: the clients target of its profile and its area. */
export interface ScoreTargets {
  osmTags: string[];
  keywords: string[];
  nafCodes: string[];
  area: string | null;
}

/** Won and lost closes per category key, from the space's closed leads. */
export type CategoryHistory = Map<string, { won: number; lost: number }>;

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_CLOSES = 2;
const AUDIT_POINTS = [6, 10, 14, 17, 20];

/** The key a category is counted under in the history: trimmed and lower case; null when the lead has none. */
export function categoryKey(category: string | null): string | null {
  const key = category?.trim().toLowerCase();
  return key ? key : null;
}

function auditReason(lead: ScoreLead): FitReason {
  if (!lead.hasWebsite) return reason('audit', 'no_website', WEIGHTS.audit);
  if (!isRecord(lead.websiteAudit)) return reason('audit', 'not_audited', 8);
  const gaps = auditGaps(lead.websiteAudit);
  if (gaps.length === 0) return reason('audit', 'audit_clean', AUDIT_POINTS[0]!);
  return reason('audit', 'audit_gaps', AUDIT_POINTS[Math.min(gaps.length, AUDIT_POINTS.length - 1)]!, gaps.join(','));
}

function reachReason(lead: ScoreLead): FitReason {
  const parts: string[] = [];
  let points = 0;
  if (lead.email) {
    points += lead.emailVerified ? 10 : 5;
    parts.push(lead.emailVerified ? 'email_verified' : 'email');
  }
  if (lead.phoneNumbers.length > 0) {
    points += 5;
    parts.push('phone');
  }
  return reason('reach', points === 0 ? 'unreachable' : 'reachable', points, parts.join(',') || null);
}

function daysSince(date: Date | null, now: Date): number | null {
  return date ? Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS)) : null;
}

function activityReason(lead: ScoreLead, now: Date): FitReason {
  if (lead.contacted || lead.emailsSentCount > 0) {
    const quiet = daysSince(lead.lastContactedAt, now);
    if (lead.emailsSentCount > 3) return reason('activity', 'over_contacted', 3, String(lead.emailsSentCount));
    if (quiet === null || quiet >= 30) return reason('activity', 'dormant', 8, quiet === null ? null : String(quiet));
    if (quiet >= 7) return reason('activity', 'follow_up_due', 15, String(quiet));
    if (quiet >= 3) return reason('activity', 'waiting', 6, String(quiet));
    return reason('activity', 'just_contacted', 2, String(quiet));
  }
  const seen = [lead.scrapedAt, lead.auditedAt, lead.createdAt].filter((date): date is Date => date !== null);
  const newest = seen.reduce((latest, date) => (date > latest ? date : latest));
  const age = daysSince(newest, now)!;
  if (age <= 14) return reason('activity', 'new', 15, String(age));
  if (age <= 60) return reason('activity', 'fresh', 10, String(age));
  return reason('activity', 'old', 5, String(age));
}

function historyReason(lead: ScoreLead, history: CategoryHistory): FitReason {
  const key = categoryKey(lead.category);
  const closes = key ? history.get(key) : undefined;
  const total = (closes?.won ?? 0) + (closes?.lost ?? 0);
  if (!closes || total < MIN_CLOSES) return reason('history', 'history_none', WEIGHTS.history / 2);
  const rate = (closes.won + 1) / (total + 2);
  return reason('history', rate >= 0.5 ? 'history_won' : 'history_lost', rate * WEIGHTS.history, `${closes.won}/${total}`);
}

function sizeReason(lead: ScoreLead): FitReason {
  const count = employeeCount(lead.websiteAudit);
  if (count === null) return reason('size', 'size_unknown', 2);
  return count <= 250 ? reason('size', 'size_sme', WEIGHTS.size, String(count)) : reason('size', 'size_large', 2, String(count));
}

/**
 * The fit of one lead for a space, 0 to 100, with the reason behind each
 * point. Pure and free of any model: the same lead, targets and history
 * always give the same answer. Factors: how well the lead's category or
 * name matches the targets (25), whether it is in the area (5), what its
 * audit shows it lacks (20), how reachable it is (15), where it stands in
 * the follow-up cycle (15), how leads of its category closed before (15)
 * and its size (5). A factor the space gave no data for earns half its
 * weight, so an empty profile ranks leads on the other factors only.
 */
export function scoreLead(lead: ScoreLead, targets: ScoreTargets, history: CategoryHistory, now: Date): FitScore {
  const reasons = [
    targetReason(lead, targets),
    areaReason(lead, targets.area),
    auditReason(lead),
    reachReason(lead),
    activityReason(lead, now),
    historyReason(lead, history),
    sizeReason(lead),
  ];
  return { score: reasons.reduce((sum, entry) => sum + entry.points, 0), reasons };
}
