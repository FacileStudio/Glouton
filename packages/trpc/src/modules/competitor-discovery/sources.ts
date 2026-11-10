import type { Prisma, PrismaClient } from '@prisma/client';
import { WebSearchError, type WebSearch } from '@repo/websearch';
import type { SearchProfile } from '../prospect/profile';
import { domainOf } from '../competitor/rules';
import type { Scope } from '../../utils/scope';
import { candidateDomain, clip, inArea, matchesNaf, mentionsArea, nameFromTitle, type Candidate } from './rules';

/** A place the map search found around the area, with its distance from the area's centre. */
export interface Place {
  name: string;
  website: string | null;
  city: string | null;
  address: string | null;
  category: string | null;
  url: string | null;
  distanceKm: number | null;
}

/** Map search by category or OpenStreetMap tag around a place name (packages/maps OpenStreetMap in production). */
export type PlacesSearch = (area: string, category: string) => Promise<Place[]>;

/** One web search a run makes, and the source its results count as. */
export interface DiscoveryQuery {
  query: string;
  source: 'SONAR_WEB' | 'SONAR_SIMILAR';
}


/** Map tags one run searches at most. */
export const MAX_PLACE_TAGS = 3;
/** Web searches one run makes at most. */
export const MAX_QUERIES = 6;
/** Results asked per web search. */
export const RESULTS_PER_QUERY = 10;
/** How far back a discovery run reads the company creation feed. */
export const BODACC_LOOKBACK_DAYS = 90;
/** Company creation rows read per run or watch. */
const BODACC_ROWS = 500;

const DAY_MS = 24 * 3600 * 1000;

/** The key a scope's websearch quota is counted under: the team, or `user:<id>` for personal work, as the page watch does. */
export function quotaKey(scope: Scope): string {
  return scope.type === 'team' ? scope.teamId : `user:${scope.userId}`;
}

/** True when the profile gives discovery something to search with. */
export function searchable(profile: SearchProfile): boolean {
  return Boolean(
    profile.keywords.length > 0 ||
      profile.offerDescription ||
      profile.description ||
      profile.website ||
      (profile.osmTags.length > 0 && profile.area) ||
      (profile.nafCodes.length > 0 && profile.area)
  );
}

function firstWords(text: string, count: number): string {
  return text.replace(/\s+/g, ' ').trim().split(' ').slice(0, count).join(' ');
}

/**
 * The web searches a run makes, at most MAX_QUERIES: the free-text
 * description of who to look for, each keyword (up to three) with the area,
 * the start of the offer with the area, then "similar to our site" searches
 * when the profile has a website.
 */
export function discoveryQueries(profile: SearchProfile): DiscoveryQuery[] {
  const place = profile.area?.split(/[,;/]/)[0]?.trim() ?? '';
  const withPlace = (text: string) => (place ? `${text} ${place}` : text);
  const queries: DiscoveryQuery[] = profile.description ? [{ query: firstWords(profile.description, 12), source: 'SONAR_WEB' }] : [];
  queries.push(...profile.keywords.slice(0, 3).map((keyword) => ({ query: withPlace(keyword), source: 'SONAR_WEB' as const })));
  if (profile.offerDescription) queries.push({ query: withPlace(firstWords(profile.offerDescription, 8)), source: 'SONAR_WEB' });
  const own = domainOf(profile.website);
  if (own) {
    queries.push({ query: `alternatives à ${own}`, source: 'SONAR_SIMILAR' });
    queries.push({ query: `concurrents de ${own}`, source: 'SONAR_SIMILAR' });
  }
  const seen = new Set<string>();
  return queries.filter((entry) => !seen.has(entry.query) && seen.add(entry.query)).slice(0, MAX_QUERIES);
}

/**
 * Runs the web searches through the scope's websearch quota. The first
 * quota refusal stops the remaining searches; the run goes on with the other
 * sources and reports `quotaExhausted`.
 */
export async function webCandidates(
  web: Pick<WebSearch, 'search'>,
  scope: Scope,
  profile: SearchProfile
): Promise<{ candidates: Candidate[]; queries: number; quotaExhausted: boolean; errors: string[] }> {
  const own = domainOf(profile.website);
  const candidates: Candidate[] = [];
  const errors: string[] = [];
  let queries = 0;
  for (const entry of discoveryQueries(profile)) {
    let results;
    try {
      results = await web.search(quotaKey(scope), entry.query, { count: RESULTS_PER_QUERY });
      queries++;
    } catch (error) {
      if (error instanceof WebSearchError && error.code === 'quota_exceeded') return { candidates, queries, quotaExhausted: true, errors };
      errors.push(error instanceof WebSearchError ? `web:${error.code}` : 'web:failed');
      continue;
    }
    for (const result of results) {
      const domain = candidateDomain(result.url, own);
      if (!domain) continue;
      const text = `${result.title} ${result.snippet}`;
      candidates.push({
        name: nameFromTitle(result.title, domain),
        domain,
        website: `https://${domain}`,
        area: null,
        siren: null,
        source: entry.source,
        evidence: { source: entry.source, snippet: clip(result.snippet || result.title), url: result.url },
        distanceKm: null,
        inArea: mentionsArea(profile.area, text),
      });
    }
  }
  return { candidates, queries, quotaExhausted: false, errors };
}

/** Places with the profile's map tags (up to MAX_PLACE_TAGS) around its area that have a website. */
export async function osmCandidates(places: PlacesSearch, profile: SearchProfile): Promise<Candidate[]> {
  const area = profile.area;
  if (profile.osmTags.length === 0 || !area) return [];
  const own = domainOf(profile.website);
  const found = (await Promise.all(profile.osmTags.slice(0, MAX_PLACE_TAGS).map((tag) => places(area, tag)))).flat();
  return found.flatMap((place) => {
    const domain = candidateDomain(place.website, own);
    if (!domain) return [];
    const where = [place.address, place.city].filter(Boolean).join(', ');
    return [
      {
        name: place.name.slice(0, 120),
        domain,
        website: `https://${domain}`,
        area: place.city,
        siren: null,
        source: 'OSM' as const,
        evidence: { source: 'OSM' as const, snippet: clip([place.category, where].filter(Boolean).join(' · ')), url: place.url },
        distanceKm: place.distanceKm,
        inArea: place.distanceKm === null,
      },
    ];
  });
}

/**
 * French companies from the company creation feed (filled by the BODACC
 * scraper) whose activity code falls under the profile's NAF codes and whose
 * address lies in its area. `since` reads only rows added after it (the
 * watch); otherwise the last BODACC_LOOKBACK_DAYS of publications are read.
 */
export async function bodaccCandidates(
  prisma: PrismaClient,
  profile: SearchProfile,
  options: { now: Date; since?: Date | null }
): Promise<Candidate[]> {
  if (profile.nafCodes.length === 0 || !profile.area) return [];
  const own = domainOf(profile.website);
  const window: Prisma.CompanyCreationWhereInput = options.since
    ? { createdAt: { gt: options.since } }
    : { publishedAt: { gte: new Date(options.now.getTime() - BODACC_LOOKBACK_DAYS * DAY_MS) } };
  const rows = await prisma.companyCreation.findMany({
    where: { country: 'FR', ...window, OR: profile.nafCodes.map((code) => ({ activityCode: { startsWith: code } })) },
    orderBy: { publishedAt: 'desc' },
    take: BODACC_ROWS,
  });
  return rows
    .filter((row) => matchesNaf(profile.nafCodes, row.activityCode) && inArea(profile.area, row))
    .map((row) => {
      const domain = candidateDomain(row.websiteUrl ?? row.domain, own);
      const date = row.publishedAt.toISOString().slice(0, 10);
      const what = [row.activityLabel, row.activityCode ? `(${row.activityCode})` : null].filter(Boolean).join(' ');
      const where = [row.postalCode, row.city].filter(Boolean).join(' ');
      return {
        name: row.name.slice(0, 120),
        domain,
        website: domain ? `https://${domain}` : null,
        area: row.city,
        siren: row.registrationId,
        source: 'BODACC' as const,
        evidence: { source: 'BODACC' as const, snippet: clip([what, where, `BODACC ${date}`].filter(Boolean).join(' · ')), url: row.sourceUrl },
        distanceKm: null,
        inArea: true,
      };
    });
}
