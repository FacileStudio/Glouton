import type { CompetitorSuggestion, Prisma, PrismaClient } from '@prisma/client';
import type { WebSearch } from '@repo/websearch';
import { dispatchWebhookEvent, type WebhookEvent } from '@repo/webhooks';
import { profileFor, scopeKey } from '../prospect/profile';
import type { Scope } from '../../utils/scope';
import { MAX_EVIDENCE, evidenceOf, mergeCandidates, nameKey, partsOf, sameEvidence, scoreOf, type Candidate, type Merged } from './rules';
import { bodaccCandidates, osmCandidates, searchable, webCandidates, type PlacesSearch } from './sources';

type Notify = (scope: Scope, type: string, data: Record<string, unknown>) => Promise<void>;

/** What a discovery run or a BODACC watch needs. Every outside service is injectable for tests. */
export interface DiscoveryDeps {
  prisma: PrismaClient;
  web: Pick<WebSearch, 'search'> | null;
  places: PlacesSearch | null;
  notify?: Notify;
  dispatch?: (options: { event: WebhookEvent; teamId: string; data: Record<string, unknown> }) => Promise<void>;
  allowed?: (scope: { userId: string; teamId: string | null }) => Promise<boolean>;
  now?: () => Date;
}

/** What one run did, stored as `CompetitorDiscoveryState.lastResult`. */
export interface DiscoveryResult {
  status: 'done' | 'empty';
  created: number;
  updated: number;
  known: number;
  decided: number;
  found: { web: number; osm: number; bodacc: number };
  queries: number;
  quotaExhausted: boolean;
  errors: string[];
}

/** The in-app event a scope receives when a run ends. */
export const DONE_EVENT = 'competitor-discovery:done';
/** The in-app event a scope receives when the BODACC watch finds new companies. */
export const REGISTERED_EVENT = 'competitor:new-registered';

/** Companies listed in one `competitor.new_registered` webhook. */
const ALERT_ITEMS = 20;
/** The time between two weekly runs of a space. */
export const WEEK_MS = 7 * 24 * 3600 * 1000;


/** The rows of one scope. */
export function scopeWhere(scope: Scope): { scopeKey: string } {
  return { scopeKey: scopeKey(scope) };
}

/** A stored row's scope. */
export function scopeOfRow(row: { userId: string; teamId: string | null }): Scope {
  return row.teamId ? { type: 'team', teamId: row.teamId, userId: row.userId } : { type: 'personal', userId: row.userId };
}

/** What saving a run's companies did. */
export interface SaveResult {
  created: CompetitorSuggestion[];
  updated: number;
  known: number;
  decided: number;
}

/**
 * Stores companies as suggestions of a scope. A company that is already a
 * competitor of the scope (same domain, or same name when it has no site) is
 * skipped; one that matches an accepted or rejected suggestion (same domain
 * or SIREN) is skipped too, so a rejected company never comes back; one that
 * matches a pending suggestion adds its sources and evidence to it and is
 * scored again.
 */
export async function saveSuggestions(prisma: PrismaClient, scope: Scope, companies: Merged[], keywords: string[]): Promise<SaveResult> {
  const key = scopeKey(scope);
  const result: SaveResult = { created: [], updated: 0, known: 0, decided: 0 };
  if (companies.length === 0) return result;
  const competitors = await prisma.competitor.findMany({
    where: scope.type === 'team' ? { teamId: scope.teamId } : { userId: scope.userId, teamId: null },
    select: { domain: true, name: true },
  });
  const knownDomains = new Set(competitors.flatMap((row) => (row.domain ? [row.domain] : [])));
  const knownNames = new Set(competitors.map((row) => nameKey(row.name)));
  const domains = companies.flatMap((company) => (company.domain ? [company.domain] : []));
  const sirens = companies.flatMap((company) => (company.siren ? [company.siren] : []));
  const existing = await prisma.competitorSuggestion.findMany({
    where: { scopeKey: key, OR: [{ domain: { in: domains } }, { siren: { in: sirens } }] },
  });
  for (const company of companies) {
    if ((company.domain && knownDomains.has(company.domain)) || (!company.domain && knownNames.has(nameKey(company.name)))) {
      result.known++;
      continue;
    }
    const match = existing.find(
      (row) => (company.domain && row.domain === company.domain) || (company.siren && row.siren === company.siren)
    );
    if (match && match.status !== 'PENDING') {
      result.decided++;
      continue;
    }
    if (match) {
      const stored = evidenceOf(match.evidence);
      const evidence = [...stored, ...company.evidence.filter((entry) => !stored.some((old) => sameEvidence(old, entry)))].slice(0, MAX_EVIDENCE);
      const sources = Array.from(new Set([...match.sources, ...company.sources]));
      const distanceKm =
        company.distanceKm === null ? match.distanceKm : match.distanceKm === null ? company.distanceKm : Math.min(match.distanceKm, company.distanceKm);
      const stillInArea = company.inArea || Boolean((match.scoreParts as { inArea?: boolean } | null)?.inArea);
      const parts = partsOf({ name: match.name, sources, evidence, distanceKm, inArea: stillInArea }, keywords);
      await prisma.competitorSuggestion.update({
        where: { id: match.id },
        data: {
          sources,
          evidence: evidence as unknown as Prisma.InputJsonValue,
          distanceKm,
          scoreParts: parts as unknown as Prisma.InputJsonValue,
          score: scoreOf(parts),
          website: match.website ?? company.website,
          area: match.area ?? company.area,
        },
      });
      result.updated++;
      continue;
    }
    const parts = partsOf(company, keywords);
    try {
      const row = await prisma.competitorSuggestion.create({
        data: {
          scopeKey: key,
          userId: scope.userId,
          teamId: scope.type === 'team' ? scope.teamId : null,
          name: company.name,
          domain: company.domain,
          website: company.website,
          area: company.area,
          siren: company.siren,
          source: company.sources[0]!,
          sources: company.sources,
          evidence: company.evidence as unknown as Prisma.InputJsonValue,
          distanceKm: company.distanceKm,
          scoreParts: parts as unknown as Prisma.InputJsonValue,
          score: scoreOf(parts),
        },
      });
      result.created.push(row);
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      result.decided++;
    }
  }
  return result;
}

async function writeState(prisma: PrismaClient, scope: Scope, data: Prisma.CompetitorDiscoveryStateUncheckedUpdateInput) {
  const key = scopeKey(scope);
  await prisma.competitorDiscoveryState.upsert({
    where: { scopeKey: key },
    create: { ...(data as Prisma.CompetitorDiscoveryStateUncheckedCreateInput), scopeKey: key, userId: scope.userId, teamId: scope.type === 'team' ? scope.teamId : null },
    update: data,
  });
}

/**
 * One discovery run for a scope: web searches (keywords, offer, similar
 * sites) through the websearch quota, map places of the space's own
 * category, and recent BODACC creations matching its NAF codes and area.
 * Results are merged per company, deduplicated against the scope's
 * competitors and every earlier suggestion, scored, and stored as pending
 * suggestions. A failing source is reported and the others still count.
 */
export async function runDiscovery(deps: DiscoveryDeps, scope: Scope): Promise<DiscoveryResult> {
  const { prisma } = deps;
  const now = deps.now?.() ?? new Date();
  const profile = await profileFor(prisma, scope);
  const result: DiscoveryResult = {
    status: 'done',
    created: 0,
    updated: 0,
    known: 0,
    decided: 0,
    found: { web: 0, osm: 0, bodacc: 0 },
    queries: 0,
    quotaExhausted: false,
    errors: [],
  };
  if (!searchable(profile)) {
    result.status = 'empty';
    await writeState(prisma, scope, { status: 'empty', lastRunAt: now, lastResult: result as unknown as Prisma.InputJsonValue, nextRunAt: new Date(now.getTime() + WEEK_MS) });
    return result;
  }
  await writeState(prisma, scope, { status: 'running' });
  const candidates: Candidate[] = [];
  if (deps.web) {
    const web = await webCandidates(deps.web, scope, profile);
    candidates.push(...web.candidates);
    result.found.web = web.candidates.length;
    result.queries = web.queries;
    result.quotaExhausted = web.quotaExhausted;
    result.errors.push(...web.errors);
  }
  if (deps.places) {
    try {
      const osm = await osmCandidates(deps.places, profile);
      candidates.push(...osm);
      result.found.osm = osm.length;
    } catch {
      result.errors.push('osm:failed');
    }
  }
  const bodacc = await bodaccCandidates(prisma, profile, { now });
  candidates.push(...bodacc);
  result.found.bodacc = bodacc.length;
  const saved = await saveSuggestions(prisma, scope, mergeCandidates(candidates), profile.keywords);
  result.created = saved.created.length;
  result.updated = saved.updated;
  result.known = saved.known;
  result.decided = saved.decided;
  await writeState(prisma, scope, {
    status: 'done',
    lastRunAt: now,
    lastResult: result as unknown as Prisma.InputJsonValue,
    nextRunAt: new Date(now.getTime() + WEEK_MS),
  });
  await deps.notify?.(scope, DONE_EVENT, { created: result.created, quotaExhausted: result.quotaExhausted }).catch(() => {});
  return result;
}

/** Records a run that threw, so the queue does not show it as running forever. */
export async function failDiscovery(prisma: PrismaClient, scope: Scope, error: unknown, now = new Date()): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 200) : 'failed';
  await writeState(prisma, scope, { status: 'failed', lastRunAt: now, lastResult: { status: 'failed', error: message } });
}

/** What one BODACC watch pass did. */
export interface WatchResult {
  scopes: number;
  baselined: number;
  created: number;
  alerts: number;
}

/**
 * The BODACC watch, run after each company creation scrape: for every
 * profile with NAF codes and an area, the companies the feed added since the
 * last pass that match both become suggestions, and new ones trigger an
 * in-app notice plus, for a team, the `competitor.new_registered` webhook
 * (Antenne). A profile's first pass only sets the cursor, so existing
 * companies arrive through a discovery run instead of an alert burst.
 */
export async function watchRegistrations(deps: DiscoveryDeps): Promise<WatchResult> {
  const { prisma } = deps;
  const now = deps.now?.() ?? new Date();
  const result: WatchResult = { scopes: 0, baselined: 0, created: 0, alerts: 0 };
  const profiles = await prisma.teamProspectProfile.findMany({
    where: { area: { not: null }, NOT: { nafCodes: { isEmpty: true } } },
    select: { userId: true, teamId: true, scopeKey: true },
  });
  for (const row of profiles) {
    const scope = scopeOfRow(row);
    if (deps.allowed && !(await deps.allowed({ userId: row.userId, teamId: row.teamId }))) continue;
    result.scopes++;
    const state = await prisma.competitorDiscoveryState.findUnique({ where: { scopeKey: row.scopeKey }, select: { bodaccCursor: true } });
    if (!state?.bodaccCursor) {
      await writeState(prisma, scope, { bodaccCursor: now });
      result.baselined++;
      continue;
    }
    const profile = await profileFor(prisma, scope);
    const found = await bodaccCandidates(prisma, profile, { now, since: state.bodaccCursor });
    const saved = await saveSuggestions(prisma, scope, mergeCandidates(found), profile.keywords);
    await writeState(prisma, scope, { bodaccCursor: now });
    if (saved.created.length === 0) continue;
    result.created += saved.created.length;
    result.alerts++;
    const items = saved.created.slice(0, ALERT_ITEMS).map((suggestion) => ({
      suggestionId: suggestion.id,
      name: suggestion.name,
      siren: suggestion.siren,
      area: suggestion.area,
      website: suggestion.website,
      evidence: evidenceOf(suggestion.evidence)[0] ?? null,
    }));
    const data = { count: saved.created.length, items };
    await deps.notify?.(scope, REGISTERED_EVENT, data).catch(() => {});
    if (scope.type === 'team') {
      await (deps.dispatch ?? dispatchWebhookEvent)({ event: 'competitor.new_registered', teamId: scope.teamId, data }).catch(() => {});
    }
  }
  return result;
}
