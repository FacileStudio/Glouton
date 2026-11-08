import { planLimitFrom, type PlanLimitError } from '@facile/muse';
import type { trpc } from '$lib/trpc';

export type PageList = Awaited<ReturnType<typeof trpc.competitorWatch.pages.query>>;
export type WatchedPage = PageList['pages'][number];
export type PageChange = Awaited<ReturnType<typeof trpc.competitorWatch.changes.query>>[number];

export const PAGE_KINDS = ['PRICING', 'OFFER', 'BLOG', 'JOBS', 'OTHER'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export const CHECK_STATUSES = [
  'never',
  'baseline',
  'unchanged',
  'minor',
  'changed',
  'empty',
  'robots_disallowed',
  'quota_exceeded',
  'fetch_failed',
] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

/** The page's last check outcome as a known status; anything unknown reads as not checked yet. */
export function checkStatus(raw: string | null): CheckStatus {
  return CHECK_STATUSES.find((status) => status === raw) ?? 'never';
}

/** The paths most sites use for the pages worth watching, with the kind each one usually is. */
export const USUAL_PATHS: ReadonlyArray<{ path: string; kind: PageKind }> = [
  { path: '/tarifs', kind: 'PRICING' },
  { path: '/pricing', kind: 'PRICING' },
  { path: '/offres', kind: 'OFFER' },
  { path: '/blog', kind: 'BLOG' },
  { path: '/recrutement', kind: 'JOBS' },
];

/** Same URL ignoring the scheme, a trailing slash and case, so suggestions skip pages already watched. */
function sameUrl(a: string, b: string): boolean {
  const key = (url: string) => url.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return key(a) === key(b);
}

/** The usual pages of a domain that are not watched yet. */
export function suggestions(domain: string | null, watched: string[]): Array<{ url: string; path: string; kind: PageKind }> {
  if (!domain) return [];
  return USUAL_PATHS.map(({ path, kind }) => ({ url: `https://${domain}${path}`, path, kind })).filter(
    (entry) => !watched.some((url) => sameUrl(url, entry.url))
  );
}

/** The plan limit a failed tRPC call carries, or null for any other error. */
export function planLimitOf(error: unknown): PlanLimitError | null {
  const data = (error as { data?: { code?: string; plan_limit?: unknown } } | null)?.data;
  if (data?.code !== 'PAYMENT_REQUIRED' || !data.plan_limit) return null;
  return planLimitFrom(data.plan_limit);
}

/** A page address without its scheme, for compact display. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/** A change ratio as a whole or one-decimal percentage. */
export function percentOf(ratio: number): string {
  const value = Math.round(ratio * 1000) / 10;
  return `${value} %`;
}
