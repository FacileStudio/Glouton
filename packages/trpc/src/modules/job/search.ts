import type { HuntFrequency, JobSearch, Prisma, PrismaClient } from '@prisma/client';
import type { QueueManager } from '@repo/jobs';
import { WebSearchError, type WebSearch } from '@repo/websearch';
import { dispatchWebhookEvent, type WebhookEvent } from '@repo/webhooks';
import { TRPCError } from '@trpc/server';
import type { Scope } from '../../utils/scope';
import { quotaKey } from '../competitor-discovery/sources';
import { scopeOfRow } from '../competitor-discovery/engine';
import { JOB_SEARCHES, LimitError, check } from '../forfait/features';
import { limitReached } from '../forfait/gate';
import { scopeValues } from '../forfait/store';
import { scopeKey } from '../prospect/profile';
import { nextRunAfter } from '../schedule/cadence';
import { matchOffer, offerKey, webPosting, webQueries, type JobContract, type JobFilters, type Posting } from './filters';

/** The queue one search run goes to. */
export const JOB_SEARCH_QUEUE = 'job-search';
/** The in-app event a scope receives when a run ends. */
export const DONE_EVENT = 'job-search:done';
/** The in-app event a person receives when an application reminder comes due. */
export const REMINDER_EVENT = 'job:reminder';
/** The most offers one run stores, best first. */
export const MAX_OFFERS_PER_RUN = 60;
/** A queued or running run older than this is treated as lost. */
export const STALE_RUN_MS = 30 * 60 * 1000;
/** The most scheduled runs one tick starts, and the gap between them. */
export const MAX_RUNS_PER_TICK = 6;
export const RUN_PACE_MS = 60 * 1000;
/** The most terms a run sends to each job board. */
const BOARD_TERMS = 2;
/** Offers listed in one `job.offers_found` webhook. */
const ALERT_ITEMS = 10;

/** A board posting as the scrapers return it; only these fields are read. */
export interface BoardPosting {
  title: string;
  description: string;
  company?: string;
  sourceUrl: string;
  tags: string[];
  budget?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  location?: string;
  isRemote: boolean;
  postedAt: Date;
  contractType?: string;
}

/** One job board, searched with free terms. */
export interface Board {
  name: string;
  search: (query: { terms: string[] }) => Promise<BoardPosting[]>;
}

type Notify = (scope: Scope, type: string, data: Record<string, unknown>) => Promise<void>;

/** What a run needs. Every outside service is injectable for tests. */
export interface JobSearchDeps {
  prisma: PrismaClient;
  boards: readonly Board[];
  web: Pick<WebSearch, 'search'> | null;
  notify?: Notify;
  dispatch?: (options: { event: WebhookEvent; teamId: string; data: Record<string, unknown> }) => Promise<void>;
  now?: () => Date;
}

/** The job data of one run. */
export interface JobSearchJob {
  userId: string;
  teamId: string | null;
  searchId: string;
  trigger: 'manual' | 'scheduled';
}

/** What one run did, stored as `JobSearch.lastResult`. */
export interface JobSearchResult {
  status: 'done' | 'empty';
  created: number;
  known: number;
  found: { boards: number; web: number };
  kept: number;
  queries: number;
  quotaExhausted: boolean;
  errors: string[];
}

type Jobs = Pick<QueueManager, 'addJob'>;

/** The searches of one scope: a team's, or the person's own personal ones. */
export function searchFilter(scope: Scope): Prisma.JobSearchWhereInput {
  return scope.type === 'team' ? { teamId: scope.teamId } : { userId: scope.userId, teamId: null };
}

/** A stored search's filters. */
export function filtersOf(row: Pick<JobSearch, 'role' | 'skills' | 'location' | 'remote' | 'contracts' | 'salaryMin'>): JobFilters {
  return { role: row.role, skills: row.skills, location: row.location, remote: row.remote, contracts: row.contracts as JobContract[], salaryMin: row.salaryMin };
}

/** A board posting in the shape the filters read. */
export function boardPosting(source: string, posting: BoardPosting): Posting | null {
  const url = offerKey(posting.sourceUrl);
  if (!url || !posting.title.trim()) return null;
  return {
    source,
    url,
    title: posting.title.trim().slice(0, 300),
    company: posting.company?.trim() || null,
    location: posting.location?.trim() || null,
    remote: posting.isRemote,
    contractText: posting.contractType ?? null,
    salaryMin: posting.budgetMin ?? null,
    salaryMax: posting.budgetMax ?? null,
    currency: posting.currency ?? null,
    salaryText: posting.budget ?? null,
    description: posting.description.slice(0, 4000),
    skills: posting.tags.slice(0, 20),
    postedAt: Number.isNaN(posting.postedAt.getTime()) ? null : posting.postedAt,
  };
}

function boardTerms(filters: JobFilters): string[] {
  const role = filters.role.trim();
  return role ? [role] : filters.skills.slice(0, BOARD_TERMS);
}

async function fromBoards(deps: JobSearchDeps, filters: JobFilters, result: JobSearchResult): Promise<Posting[]> {
  const terms = boardTerms(filters);
  if (terms.length === 0) return [];
  const settled = await Promise.allSettled(deps.boards.map(async (board) => ({ board, postings: await board.search({ terms }) })));
  const out: Posting[] = [];
  settled.forEach((entry, index) => {
    if (entry.status === 'rejected') {
      result.errors.push(`${deps.boards[index]!.name}:failed`);
      return;
    }
    for (const raw of entry.value.postings) {
      const posting = boardPosting(entry.value.board.name, raw);
      if (posting) out.push(posting);
    }
  });
  result.found.boards = out.length;
  return out;
}

async function fromWeb(deps: JobSearchDeps, scope: Scope, filters: JobFilters, result: JobSearchResult): Promise<Posting[]> {
  if (!deps.web) return [];
  const out: Posting[] = [];
  for (const query of webQueries(filters)) {
    try {
      result.queries++;
      const found = await deps.web.search(quotaKey(scope), query, { count: 10 });
      for (const entry of found) {
        const posting = webPosting(entry);
        if (posting) out.push(posting);
      }
    } catch (error) {
      if (error instanceof WebSearchError && error.code === 'quota_exceeded') {
        result.quotaExhausted = true;
        break;
      }
      result.errors.push(`web:${error instanceof WebSearchError ? error.code : 'failed'}`);
    }
  }
  result.found.web = out.length;
  return out;
}

/** Postings that pass the filters, one per address, best first. */
export function rank(postings: Posting[], filters: JobFilters): Array<Posting & { score: number; contract: JobContract | null }> {
  const byUrl = new Map<string, Posting & { score: number; contract: JobContract | null }>();
  for (const posting of postings) {
    const match = matchOffer(posting, filters);
    if (!match.keep) continue;
    const current = byUrl.get(posting.url);
    if (!current || current.score < match.score) byUrl.set(posting.url, { ...posting, score: match.score, contract: match.contract });
  }
  return Array.from(byUrl.values()).sort((a, b) => b.score - a.score);
}

async function writeRun(prisma: PrismaClient, searchId: string, data: Prisma.JobSearchUncheckedUpdateInput) {
  await prisma.jobSearch.update({ where: { id: searchId }, data });
}

function nextSlot(row: Pick<JobSearch, 'frequency' | 'nextRunAt'>, now: Date): Date | null {
  if (!row.frequency) return null;
  return nextRunAfter(row.frequency, row.nextRunAt ?? now, now);
}

/**
 * One run of a search: the job boards with the role (or the first skills),
 * then web searches for career pages and listings through the websearch
 * quota. Postings are filtered, deduplicated by address and stored as new
 * offers of the scope; an address the scope already has, dismissed or not,
 * is skipped. A failing board or query is reported and the rest still count.
 */
export async function runSearch(deps: JobSearchDeps, job: JobSearchJob): Promise<JobSearchResult> {
  const { prisma } = deps;
  const now = deps.now?.() ?? new Date();
  const scope = scopeOfRow({ userId: job.userId, teamId: job.teamId });
  const row = await prisma.jobSearch.findFirst({ where: { id: job.searchId, ...searchFilter(scope) } });
  const result: JobSearchResult = { status: 'done', created: 0, known: 0, found: { boards: 0, web: 0 }, kept: 0, queries: 0, quotaExhausted: false, errors: [] };
  if (!row) return { ...result, status: 'empty' };
  const filters = filtersOf(row);
  if (!filters.role.trim() && filters.skills.length === 0) {
    await writeRun(prisma, row.id, { status: 'empty', lastRunAt: now, lastResult: { ...result, status: 'empty' } as unknown as Prisma.InputJsonValue });
    return { ...result, status: 'empty' };
  }
  await writeRun(prisma, row.id, { status: 'running' });
  const postings = [...(await fromBoards(deps, filters, result)), ...(await fromWeb(deps, scope, filters, result))];
  const ranked = rank(postings, filters).slice(0, MAX_OFFERS_PER_RUN);
  result.kept = ranked.length;
  const key = scopeKey(scope);
  const known = new Set(
    (await prisma.jobOffer.findMany({ where: { scopeKey: key, url: { in: ranked.map((entry) => entry.url) } }, select: { url: true } })).map((entry) => entry.url)
  );
  const created: Array<{ id: string; title: string; company: string | null; url: string; score: number }> = [];
  for (const offer of ranked) {
    if (known.has(offer.url)) {
      result.known++;
      continue;
    }
    try {
      const saved = await prisma.jobOffer.create({
        data: {
          scopeKey: key,
          userId: scope.userId,
          teamId: scope.type === 'team' ? scope.teamId : null,
          searchId: row.id,
          source: offer.source,
          url: offer.url,
          title: offer.title,
          company: offer.company,
          location: offer.location,
          remote: offer.remote,
          contract: offer.contract,
          salaryMin: offer.salaryMin,
          salaryMax: offer.salaryMax,
          currency: offer.currency,
          salaryText: offer.salaryText,
          description: offer.description,
          skills: offer.skills,
          postedAt: offer.postedAt,
          score: offer.score,
        },
        select: { id: true, title: true, company: true, url: true, score: true },
      });
      created.push(saved);
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      result.known++;
    }
  }
  result.created = created.length;
  await writeRun(prisma, row.id, { status: 'done', lastRunAt: now, lastResult: result as unknown as Prisma.InputJsonValue });
  await deps.notify?.(scope, DONE_EVENT, { searchId: row.id, created: result.created, quotaExhausted: result.quotaExhausted }).catch(() => {});
  if (job.trigger === 'scheduled' && scope.type === 'team' && created.length > 0) {
    const data = { searchId: row.id, search: row.name, count: created.length, offers: created.slice(0, ALERT_ITEMS) };
    await (deps.dispatch ?? dispatchWebhookEvent)({ event: 'job.offers_found', teamId: scope.teamId, data }).catch(() => {});
  }
  return result;
}

/** Records a run that threw, so the search does not show as running forever. */
export async function failSearch(prisma: PrismaClient, searchId: string, error: unknown, now = new Date()): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 200) : 'failed';
  await prisma.jobSearch.updateMany({ where: { id: searchId }, data: { status: 'failed', lastRunAt: now, lastResult: { status: 'failed', error: message } } });
}

function busy(row: Pick<JobSearch, 'status' | 'queuedAt'>, now: Date): boolean {
  if (row.status !== 'queued' && row.status !== 'running') return false;
  return Boolean(row.queuedAt && now.getTime() - row.queuedAt.getTime() < STALE_RUN_MS);
}

/** The run status a person sees: a queued or running run that went stale reads as failed. */
export function runStatus(row: Pick<JobSearch, 'status' | 'queuedAt'>, now = new Date()): string | null {
  if (row.status !== 'queued' && row.status !== 'running') return row.status;
  return busy(row, now) ? row.status : 'failed';
}

const notFound = () => new TRPCError({ code: 'NOT_FOUND', message: 'Search not found' });

async function loadSearch(prisma: PrismaClient, scope: Scope, searchId: string) {
  const row = await prisma.jobSearch.findFirst({ where: { id: searchId, ...searchFilter(scope) } });
  if (!row) throw notFound();
  return row;
}

/** Refuses a recurring search past the plan's `glouton.job_searches` cap. No cap while plans are not enforced. */
async function ensureRoom(prisma: PrismaClient, scope: Scope, exceptId?: string): Promise<void> {
  const plan = await scopeValues(prisma, { userId: scope.userId, teamId: scope.type === 'team' ? scope.teamId : null });
  if (!plan.enforced) return;
  const used = await prisma.jobSearch.count({
    where: { ...searchFilter(scope), frequency: { not: null }, enabled: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  try {
    check(plan.values, JOB_SEARCHES, used, 1, plan.upgradeUrl);
  } catch (error) {
    if (error instanceof LimitError) throw limitReached(error);
    throw error;
  }
}

/** The fields a person sets on a search. */
export interface SearchFields extends JobFilters {
  name?: string;
  frequency: HuntFrequency | null;
}

function searchData(fields: SearchFields) {
  return {
    name: (fields.name?.trim() || fields.role.trim() || fields.skills[0] || 'Search').slice(0, 120),
    role: fields.role.trim(),
    skills: Array.from(new Set(fields.skills.map((skill) => skill.trim()).filter(Boolean))),
    location: fields.location?.trim() || null,
    remote: fields.remote,
    contracts: Array.from(new Set(fields.contracts)),
    salaryMin: fields.salaryMin ?? null,
    frequency: fields.frequency,
  };
}

function presentSearch(row: JobSearch, now = new Date()) {
  return { ...row, status: runStatus(row, now), lastResult: row.lastResult as unknown as JobSearchResult | null };
}

export async function listSearches(prisma: PrismaClient, scope: Scope) {
  const rows = await prisma.jobSearch.findMany({ where: searchFilter(scope), orderBy: { createdAt: 'desc' } });
  return rows.map((row) => presentSearch(row));
}

export async function createSearch(prisma: PrismaClient, scope: Scope, fields: SearchFields, now = new Date()) {
  if (fields.frequency) await ensureRoom(prisma, scope);
  const data = searchData(fields);
  const row = await prisma.jobSearch.create({
    data: { ...data, userId: scope.userId, teamId: scope.type === 'team' ? scope.teamId : null, nextRunAt: data.frequency ? nextRunAfter(data.frequency, now, now) : null },
  });
  return presentSearch(row, now);
}

export async function updateSearch(prisma: PrismaClient, scope: Scope, searchId: string, fields: SearchFields, now = new Date()) {
  const current = await loadSearch(prisma, scope, searchId);
  if (fields.frequency && current.enabled && !current.frequency) await ensureRoom(prisma, scope, current.id);
  const data = searchData(fields);
  const cadenceChanged = data.frequency !== current.frequency;
  const row = await prisma.jobSearch.update({
    where: { id: current.id },
    data: { ...data, ...(cadenceChanged ? { nextRunAt: data.frequency ? nextRunAfter(data.frequency, now, now) : null } : {}) },
  });
  return presentSearch(row, now);
}

export async function deleteSearch(prisma: PrismaClient, scope: Scope, searchId: string) {
  const row = await loadSearch(prisma, scope, searchId);
  await prisma.jobSearch.delete({ where: { id: row.id } });
  return { searchId: row.id };
}

/** Queues a run of the search now; a no-op while one is already queued or running. */
export async function requestRun(prisma: PrismaClient, jobs: Jobs, scope: Scope, searchId: string, now = new Date()) {
  const row = await loadSearch(prisma, scope, searchId);
  if (busy(row, now)) return { queued: false };
  await prisma.jobSearch.update({ where: { id: row.id }, data: { status: 'queued', queuedAt: now } });
  const job: JobSearchJob = { userId: scope.userId, teamId: scope.type === 'team' ? scope.teamId : null, searchId: row.id, trigger: 'manual' };
  await jobs.addJob(JOB_SEARCH_QUEUE, JOB_SEARCH_QUEUE, job, { removeOnComplete: 20, removeOnFail: 20 });
  return { queued: true };
}

/** What the tick needs: the database, the queue, the plan gate, the clock. */
export interface TickDeps {
  prisma: PrismaClient;
  jobs: Jobs;
  allowed: (scope: { userId: string; teamId: string | null }) => Promise<boolean>;
  now?: () => Date;
}

/**
 * Starts the recurring searches whose slot came, from the hunt-schedules
 * tick. The slot is claimed with an update on the `nextRunAt` value read,
 * so two ticks never queue the same search twice. A space without a plan
 * keeps its slot moving without a run.
 */
export async function tick(deps: TickDeps): Promise<{ queued: number; skipped: number }> {
  const { prisma } = deps;
  const now = deps.now?.() ?? new Date();
  const result = { queued: 0, skipped: 0 };
  const due = await prisma.jobSearch.findMany({
    where: { enabled: true, frequency: { not: null }, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: 'asc' },
    take: MAX_RUNS_PER_TICK * 4,
  });
  for (const row of due) {
    if (result.queued >= MAX_RUNS_PER_TICK) break;
    if (busy(row, now)) continue;
    const allowed = await deps.allowed({ userId: row.userId, teamId: row.teamId });
    const slot = nextSlot(row, now);
    const claim = allowed ? { status: 'queued', queuedAt: now, nextRunAt: slot } : { nextRunAt: slot };
    const claimed = await prisma.jobSearch.updateMany({ where: { id: row.id, nextRunAt: row.nextRunAt }, data: claim });
    if (claimed.count === 0) continue;
    if (!allowed) {
      result.skipped++;
      continue;
    }
    const job: JobSearchJob = { userId: row.userId, teamId: row.teamId, searchId: row.id, trigger: 'scheduled' };
    await deps.jobs.addJob(JOB_SEARCH_QUEUE, JOB_SEARCH_QUEUE, job, { delay: result.queued * RUN_PACE_MS, removeOnComplete: 20, removeOnFail: 20 });
    result.queued++;
  }
  return result;
}
