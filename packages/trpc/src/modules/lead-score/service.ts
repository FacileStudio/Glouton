import type { Lead, PrismaClient } from '@prisma/client';
import { complete } from '../assistant/bulle';
import { requireBulle } from '../assistant/service';
import { auditGaps } from './audit';
import { scoreLead, categoryKey, type CategoryHistory, type FitScore, type ScoreLead, type ScoreTargets } from './rules';
import { aiError, requireAiAccess, type AiDeps } from '../competitor-ai/service';
import { systemFor, type AiLanguage } from '../competitor-ai/prompt';
import { profileFor } from '../prospect/profile';
import { buildLeadFilter, type Scope } from '../../utils/scope';
import { EXPLAIN_RULES, explainInput, explainSystemRule, parseExplanation, type LeadExplanation } from './explain';

/** Open leads read per ranking: the newest ones, so the audit JSON of an old backlog is never loaded whole. */
export const RANKED_LEADS_MAX = 500;

const scoreSelect = {
  id: true,
  category: true,
  businessName: true,
  domain: true,
  city: true,
  country: true,
  hasWebsite: true,
  email: true,
  emailVerified: true,
  phoneNumbers: true,
  websiteAudit: true,
  scrapedAt: true,
  auditedAt: true,
  createdAt: true,
  contacted: true,
  lastContactedAt: true,
  emailsSentCount: true,
  status: true,
} as const;

/** The targets a space's profile gives the score: its clients target and its area. */
export async function targetsOf(prisma: PrismaClient, scope: Scope): Promise<ScoreTargets> {
  const profile = await profileFor(prisma, scope);
  const clients = profile.targets.clients;
  return { osmTags: clients.osmTags, keywords: clients.keywords, nafCodes: clients.nafCodes, area: profile.area };
}

/** How the space's closed leads ended, per category. */
export async function historyOf(prisma: PrismaClient, scope: Scope): Promise<CategoryHistory> {
  const rows = await prisma.lead.groupBy({
    by: ['category', 'outcome'],
    where: { ...buildLeadFilter(scope), outcome: { not: null } },
    _count: { _all: true },
  });
  const history: CategoryHistory = new Map();
  for (const row of rows) {
    const key = categoryKey(row.category);
    if (!key) continue;
    const entry = history.get(key) ?? { won: 0, lost: 0 };
    if (row.outcome === 'WON') entry.won += row._count._all;
    else entry.lost += row._count._all;
    history.set(key, entry);
  }
  return history;
}

export interface RankedLead {
  leadId: string;
  businessName: string | null;
  domain: string | null;
  category: string | null;
  city: string | null;
  status: string;
  score: number;
  reasons: FitScore['reasons'];
}

/**
 * The scope's open leads scored and sorted, best first, with no model
 * involved. Ties keep the newest lead first. Closed leads are left out.
 */
export async function rankLeads(
  prisma: PrismaClient,
  scope: Scope,
  options: { limit: number; offset: number; minScore?: number; now?: Date }
): Promise<{ items: RankedLead[]; total: number; considered: number }> {
  const now = options.now ?? new Date();
  const [targets, history, rows] = await Promise.all([
    targetsOf(prisma, scope),
    historyOf(prisma, scope),
    prisma.lead.findMany({
      where: { ...buildLeadFilter(scope), outcome: null },
      orderBy: { createdAt: 'desc' },
      take: RANKED_LEADS_MAX,
      select: scoreSelect,
    }),
  ]);
  const scored = rows
    .map((row, order) => ({ row, order, fit: scoreLead(row, targets, history, now) }))
    .filter((entry) => entry.fit.score >= (options.minScore ?? 0))
    .sort((a, b) => b.fit.score - a.fit.score || a.order - b.order);
  const items = scored.slice(options.offset, options.offset + options.limit).map(({ row, fit }) => ({
    leadId: row.id,
    businessName: row.businessName,
    domain: row.domain,
    category: row.category,
    city: row.city,
    status: row.status,
    score: fit.score,
    reasons: fit.reasons,
  }));
  return { items, total: scored.length, considered: rows.length };
}

function factsOf(lead: Lead) {
  const audit = lead.websiteAudit as { seo?: { title?: string; description?: string }; companyInfo?: { description?: string; industry?: string } } | null;
  return [
    { label: 'Name', value: lead.businessName },
    { label: 'Category', value: lead.category },
    { label: 'City', value: lead.city },
    { label: 'Website title', value: audit?.seo?.title },
    { label: 'Website description', value: audit?.seo?.description ?? audit?.companyInfo?.description },
    { label: 'Industry', value: audit?.companyInfo?.industry },
    { label: 'Audit gaps', value: auditGaps(lead.websiteAudit).join(', ') },
    { label: 'Emails sent', value: String(lead.emailsSentCount) },
  ];
}

/** The notes and recent activity logged on the contact record mirrored from a lead. */
async function notesOf(prisma: PrismaClient, scope: Scope, lead: Lead): Promise<string[]> {
  const company = await prisma.company.findFirst({
    where: { legacyLeadId: lead.id, deletedAt: null, ...(scope.type === 'team' ? { teamId: scope.teamId } : { userId: scope.userId, teamId: null }) },
    select: {
      notes: true,
      activities: { orderBy: { occurredAt: 'desc' }, take: 5, select: { kind: true, summary: true, occurredAt: true } },
    },
  });
  if (!company) return [];
  const activity = company.activities.map((entry) => `${entry.occurredAt.toISOString().slice(0, 10)} ${entry.kind}: ${entry.summary}`);
  return [company.notes, ...activity].filter((text): text is string => Boolean(text?.trim()));
}

/**
 * Asks Bulle for a two-sentence reading of one lead's score and one next
 * step. The score is recomputed here, never taken from the client. Scraped
 * text, notes and activity travel in a data block of the `input` field; the
 * answer is validated whole.
 */
export async function explainLead(deps: AiDeps, scope: Scope, lead: Lead, language: AiLanguage): Promise<LeadExplanation & { score: number }> {
  const client = requireBulle(deps.bulle);
  const spaceId = await requireAiAccess(deps.forfait, scope);
  const [targets, history, notes] = await Promise.all([targetsOf(deps.prisma, scope), historyOf(deps.prisma, scope), notesOf(deps.prisma, scope, lead)]);
  const fit = scoreLead(lead as ScoreLead, targets, history, (deps.now ?? (() => new Date()))());
  try {
    const raw = await complete(client, scope.userId, {
      system: systemFor(EXPLAIN_RULES, language, explainSystemRule),
      prompt: 'Explain this prospect.',
      input: explainInput({ score: fit.score, reasons: fit.reasons, facts: factsOf(lead), notes }),
      maxTokens: 500,
      spaceId,
    });
    return { ...parseExplanation(raw), score: fit.score };
  } catch (error) {
    return aiError(error);
  }
}
