import type { Prisma, PrismaClient, WatchedPageKind } from '@prisma/client';
import { WebSearchError, type WebSearch } from '@repo/websearch';
import { allowEveryScope, type ScopeGate } from '../../types';
import { prune, recordFetch } from './record';
import { deliverDigests } from './digest';
import { isAllowed, loadRobots, type RobotsPolicy } from './robots';

/** Snapshots kept per page; older ones are deleted after each check. */
export const SNAPSHOTS_KEPT = 5;
/** Changes kept per page; older ones are deleted after each check. */
export const CHANGES_KEPT = 100;
/** A page checked more recently than this is skipped, so a restart does not fetch it twice in a day. */
export const RECHECK_AFTER_MS = 20 * 60 * 60 * 1000;
/** The least time between two fetches on one host. */
export const DOMAIN_INTERVAL_MS = 10_000;
const MAX_CRAWL_DELAY_MS = 60_000;

/** The outcome of one page check, stored as `WatchedPage.lastStatus`. */
export type CheckStatus =
  | 'baseline'
  | 'unchanged'
  | 'minor'
  | 'changed'
  | 'empty'
  | 'robots_disallowed'
  | 'quota_exceeded'
  | 'fetch_failed';

/** One scope as a digest addresses it. */
export interface WatchScope {
  userId: string;
  teamId: string | null;
}

/** One recorded change as the digest lists it: no page text, only where and how much. */
export interface DigestItem {
  changeId: string;
  competitorId: string;
  competitorName: string;
  url: string;
  kind: WatchedPageKind;
  changePercent: number;
  added: number;
  removed: number;
}

/** The single daily message a scope receives. */
export interface Digest {
  scope: WatchScope;
  items: DigestItem[];
  quotaSkipped: number;
}

export interface WatchDeps {
  prisma: PrismaClient;
  web: Pick<WebSearch, 'fetch'>;
  allowed?: ScopeGate;
  robots?: (origin: string) => Promise<RobotsPolicy>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  domainIntervalMs?: number;
  sendDigest?: (digest: Digest) => Promise<void>;
}

export interface WatchResult {
  checked: number;
  changed: number;
  skipped: Partial<Record<CheckStatus, number>>;
  digests: number;
}

interface Page {
  id: string;
  url: string;
  selector: string | null;
  thresholdPct: number;
  competitor: { userId: string; teamId: string | null };
}

/** The key a scope's websearch quota is counted under: the team, or the person for personal work. */
export function quotaKey(scope: WatchScope): string {
  return scope.teamId ?? `user:${scope.userId}`;
}

/** Orders pages so consecutive fetches alternate between hosts, which keeps the per-host waits short. */
export function interleaveByHost<T extends { url: string }>(pages: T[]): T[] {
  const byHost = new Map<string, T[]>();
  for (const page of pages) {
    const host = new URL(page.url).hostname;
    byHost.set(host, [...(byHost.get(host) ?? []), page]);
  }
  const queues = Array.from(byHost.values());
  const out: T[] = [];
  for (let round = 0; out.length < pages.length; round++) {
    for (const queue of queues) if (queue[round]) out.push(queue[round]!);
  }
  return out;
}

const dueWhere = (now: Date): Prisma.WatchedPageWhereInput => ({
  enabled: true,
  competitor: { status: 'ACTIVE' },
  OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - RECHECK_AFTER_MS) } }],
});

/** Waits until the host may be hit again, honouring a crawl delay up to a minute. */
async function politeWait(
  host: string,
  lastHit: Map<string, number>,
  intervalMs: number,
  policy: RobotsPolicy,
  sleep: (ms: number) => Promise<void>,
  now: () => Date
): Promise<void> {
  const previous = lastHit.get(host);
  const delay = Math.min(MAX_CRAWL_DELAY_MS, Math.max(intervalMs, (policy.crawlDelaySeconds ?? 0) * 1000));
  if (previous !== undefined) {
    const wait = previous + delay - now().getTime();
    if (wait > 0) await sleep(wait);
  }
  lastHit.set(host, now().getTime());
}

interface RunState {
  prisma: PrismaClient;
  web: Pick<WebSearch, 'fetch'>;
  robotsFor: (origin: string) => Promise<RobotsPolicy>;
  policies: Map<string, RobotsPolicy>;
  lastHit: Map<string, number>;
  interval: number;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
}

/** Checks one page: robots.txt, the per-host pause, the fetch through the scope's quota, then the comparison. */
async function checkPage(page: Page, key: string, run: RunState): Promise<CheckStatus> {
  const url = new URL(page.url);
  if (!run.policies.has(url.origin)) run.policies.set(url.origin, await run.robotsFor(url.origin));
  const policy = run.policies.get(url.origin)!;
  if (!isAllowed(policy, `${url.pathname}${url.search}`)) return 'robots_disallowed';
  await politeWait(url.hostname, run.lastHit, run.interval, policy, run.sleep, run.now);
  try {
    const fetched = await run.web.fetch(key, [page.url], { selector: page.selector ?? undefined });
    return await recordFetch(run.prisma, page, fetched[0]?.markdown ?? '', run.now());
  } catch (error) {
    return error instanceof WebSearchError && error.code === 'quota_exceeded' ? 'quota_exceeded' : 'fetch_failed';
  }
}

function bump(skipped: WatchResult['skipped'], status: CheckStatus): void {
  skipped[status] = (skipped[status] ?? 0) + 1;
}

/**
 * The daily run: checks every due page of every scope that has a plan,
 * through the websearch fetch quota, robots.txt and a per-host pause, then
 * sends one digest per scope with the changes no digest carried yet.
 */
export async function runWatch(deps: WatchDeps): Promise<WatchResult> {
  const { prisma, web } = deps;
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const allowed = deps.allowed ?? allowEveryScope;
  const robotsFor = deps.robots ?? ((origin: string) => loadRobots(origin));
  const interval = deps.domainIntervalMs ?? DOMAIN_INTERVAL_MS;

  const due = await prisma.watchedPage.findMany({
    where: dueWhere(now()),
    orderBy: { createdAt: 'asc' },
    select: { id: true, url: true, selector: true, thresholdPct: true, competitor: { select: { userId: true, teamId: true } } },
  });

  const verdicts = new Map<string, boolean>();
  const scopes = new Map<string, WatchScope>();
  const exhausted = new Set<string>();
  const quotaSkipped = new Map<string, number>();
  const run: RunState = { prisma, web, robotsFor, policies: new Map(), lastHit: new Map(), interval, sleep, now };
  const result: WatchResult = { checked: 0, changed: 0, skipped: {}, digests: 0 };

  for (const page of interleaveByHost(due)) {
    const scope = { userId: page.competitor.userId, teamId: page.competitor.teamId };
    const key = quotaKey(scope);
    if (!verdicts.has(key)) verdicts.set(key, await allowed(scope));
    if (!verdicts.get(key)) continue;
    scopes.set(key, scope);

    const status = exhausted.has(key) ? 'quota_exceeded' : await checkPage(page, key, run);
    if (status === 'quota_exceeded') {
      exhausted.add(key);
      quotaSkipped.set(key, (quotaSkipped.get(key) ?? 0) + 1);
    }
    const checked = status !== 'quota_exceeded' && status !== 'robots_disallowed';
    await prisma.watchedPage.update({
      where: { id: page.id },
      data: { lastStatus: status, ...(checked ? { lastCheckedAt: now() } : {}) },
    });
    if (checked) result.checked++;
    if (status === 'changed') result.changed++;
    else if (!['baseline', 'unchanged', 'minor'].includes(status)) bump(result.skipped, status);
    await prune(prisma, page.id);
  }

  result.digests = await deliverDigests(prisma, scopes, quotaSkipped, now(), deps.sendDigest);
  return result;
}
