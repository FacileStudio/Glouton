import type { CompetitorSuggestionSource } from '@prisma/client';
import { domainOf } from '../competitor/rules';

/** One reason a suggestion was made: which source saw it, what it said, and where. */
export interface Evidence {
  source: CompetitorSuggestionSource;
  snippet: string;
  url: string | null;
}

/** A company one source found, before deduplication and scoring. */
export interface Candidate {
  name: string;
  domain: string | null;
  website: string | null;
  area: string | null;
  siren: string | null;
  source: CompetitorSuggestionSource;
  evidence: Evidence;
  distanceKm: number | null;
  inArea: boolean;
}

/** Why a suggestion has its score, stored next to it and shown in the queue. */
export interface ScoreParts {
  sources: CompetitorSuggestionSource[];
  keywords: string[];
  keywordTotal: number;
  distanceKm: number | null;
  inArea: boolean;
  nafMatch: boolean;
}

/** The most evidence lines one suggestion keeps. */
export const MAX_EVIDENCE = 5;

const MAX_NAME = 120;
const MAX_SNIPPET = 300;

/**
 * Hosts that list companies rather than being one: directories, social
 * networks, marketplaces, encyclopedias and search engines. A web result on
 * one of these is never a competitor.
 */
export const BLOCKED_DOMAINS = [
  'pagesjaunes.fr',
  'societe.com',
  'pappers.fr',
  'infogreffe.fr',
  'verif.com',
  'manageo.fr',
  'annuaire-entreprises.data.gouv.fr',
  'bodacc.fr',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'tiktok.com',
  'pinterest.com',
  'wikipedia.org',
  'google.com',
  'google.fr',
  'bing.com',
  'duckduckgo.com',
  'yelp.com',
  'yelp.fr',
  'tripadvisor.com',
  'tripadvisor.fr',
  'trustpilot.com',
  'indeed.com',
  'indeed.fr',
  'welcometothejungle.com',
  'malt.fr',
  'malt.com',
  'codeur.com',
  'sortlist.fr',
  'sortlist.com',
  'clutch.co',
  'amazon.fr',
  'amazon.com',
  'leboncoin.fr',
  'reddit.com',
  'medium.com',
  'apple.com',
  'mappy.com',
  'openstreetmap.org',
];

/** Lowercases, strips accents and punctuation, and squeezes spaces, for text matching. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A company name reduced for matching: normalized, without legal forms. */
export function nameKey(name: string): string {
  return normalizeText(name)
    .replace(/\b(sarl|sasu|sas|eurl|sa|sci|snc|ei|eirl|scop|ltd|gmbh|inc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The domain a suggestion is keyed by, or null for an address that is not a public site or is a directory. */
export function candidateDomain(url: string | null | undefined, ownDomain: string | null = null): string | null {
  const domain = domainOf(url);
  if (!domain || !domain.includes('.')) return null;
  if (ownDomain && (domain === ownDomain || domain.endsWith(`.${ownDomain}`))) return null;
  if (BLOCKED_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`))) return null;
  return domain;
}

/** A readable company name from a search result title: the part before the first separator. */
export function nameFromTitle(title: string, domain: string): string {
  const head = title.split(/\s[|\-–—:·]\s/)[0]?.trim() ?? '';
  const name = head.length >= 2 ? head : domain;
  return name.slice(0, MAX_NAME);
}

/** Cuts a snippet to the stored length. */
export function clip(text: string | null | undefined): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > MAX_SNIPPET ? `${clean.slice(0, MAX_SNIPPET - 1)}…` : clean;
}

/** The profile keywords found in a text, matched on whole normalized words. */
export function keywordHits(keywords: string[], text: string): string[] {
  const haystack = ` ${normalizeText(text)} `;
  return keywords.filter((keyword) => {
    const needle = normalizeText(keyword);
    return needle.length > 0 && haystack.includes(` ${needle} `);
  });
}

/** True when an activity code (such as 62.01Z) falls under one of the profile's NAF codes, read as prefixes. */
export function matchesNaf(nafCodes: string[], activityCode: string | null | undefined): boolean {
  if (!activityCode) return false;
  const code = activityCode.trim().toUpperCase();
  return nafCodes.some((naf) => naf && code.startsWith(naf.trim().toUpperCase()));
}

const COUNTRY_PARTS = new Set(['fr', 'france']);

/**
 * True when a registered address lies in the profile's area. The area is a
 * place name, possibly with commas ("Lyon, FR"); each part may be a city, a
 * region, a postcode (69003) or a department number (69). Cities match with
 * or without a district suffix ("Lyon 3e" and "Lyon").
 */
export function inArea(area: string | null | undefined, place: { city?: string | null; postalCode?: string | null; region?: string | null }): boolean {
  if (!area) return false;
  const city = normalizeText(place.city ?? '');
  const region = normalizeText(place.region ?? '');
  const postcode = (place.postalCode ?? '').replace(/\s+/g, '');
  const parts = area
    .split(/[,;/]/)
    .map(normalizeText)
    .filter((part) => part && !COUNTRY_PARTS.has(part));
  return parts.some((part) => {
    if (/^\d{5}$/.test(part)) return postcode === part;
    if (/^\d{2,3}$/.test(part)) return postcode.startsWith(part);
    if (city && (part === city || city.startsWith(`${part} `) || part.startsWith(`${city} `))) return true;
    return Boolean(region) && part === region;
  });
}

/** True when a text names the area's first part, such as "Lyon" for "Lyon, FR". */
export function mentionsArea(area: string | null | undefined, text: string): boolean {
  const first = normalizeText(area?.split(/[,;/]/)[0] ?? '');
  return first.length >= 2 && ` ${normalizeText(text)} `.includes(` ${first} `);
}

/**
 * The 0-100 score of a suggestion, from three visible parts:
 * - sources: 15 points per distinct source that found it, up to 45;
 * - keywords: up to 35, the share of profile keywords its evidence mentions
 *   (a BODACC match on the NAF code counts as full marks);
 * - place: 20 within 5 km, 12 within 15 km, 6 within 30 km, or 15 when its
 *   address or evidence names the area.
 */
export function scoreOf(parts: ScoreParts): number {
  const sources = Math.min(45, new Set(parts.sources).size * 15);
  const share = parts.keywordTotal > 0 ? parts.keywords.length / parts.keywordTotal : 0;
  const keywords = parts.nafMatch ? 35 : Math.round(share * 35);
  let place = 0;
  if (parts.distanceKm !== null) place = parts.distanceKm <= 5 ? 20 : parts.distanceKm <= 15 ? 12 : parts.distanceKm <= 30 ? 6 : 0;
  if (place === 0 && parts.inArea) place = 15;
  return Math.min(100, sources + keywords + place);
}

/** The key that makes two candidates the same company: the domain, else the SIREN. */
export function candidateKey(candidate: Pick<Candidate, 'domain' | 'siren'>): string | null {
  if (candidate.domain) return `d:${candidate.domain}`;
  if (candidate.siren) return `s:${candidate.siren}`;
  return null;
}

/** True when two evidence lines come from the same source and point at the same page (or say the same thing). */
export function sameEvidence(a: Evidence, b: Evidence): boolean {
  return a.source === b.source && (a.url ?? a.snippet) === (b.url ?? b.snippet);
}

/** One company with everything the sources said about it. */
export interface Merged {
  name: string;
  domain: string | null;
  website: string | null;
  area: string | null;
  siren: string | null;
  sources: CompetitorSuggestionSource[];
  evidence: Evidence[];
  distanceKm: number | null;
  inArea: boolean;
}

/**
 * Folds candidates that share a domain or a SIREN into one company each,
 * keeping the first name, every distinct source, the nearest distance and up
 * to MAX_EVIDENCE evidence lines. Candidates with neither key are dropped.
 */
export function mergeCandidates(candidates: Candidate[]): Merged[] {
  const byKey = new Map<string, Merged>();
  const aliases = new Map<string, string>();
  for (const candidate of candidates) {
    const keys = [candidate.domain ? `d:${candidate.domain}` : null, candidate.siren ? `s:${candidate.siren}` : null].filter(
      (key): key is string => key !== null
    );
    if (keys.length === 0) continue;
    const known = keys.map((key) => aliases.get(key)).find((key) => key !== undefined);
    const key = known ?? keys[0]!;
    for (const alias of keys) aliases.set(alias, key);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        name: candidate.name,
        domain: candidate.domain,
        website: candidate.website,
        area: candidate.area,
        siren: candidate.siren,
        sources: [candidate.source],
        evidence: [candidate.evidence],
        distanceKm: candidate.distanceKm,
        inArea: candidate.inArea,
      });
      continue;
    }
    existing.domain ??= candidate.domain;
    existing.website ??= candidate.website;
    existing.area ??= candidate.area;
    existing.siren ??= candidate.siren;
    if (!existing.sources.includes(candidate.source)) existing.sources.push(candidate.source);
    if (existing.evidence.length < MAX_EVIDENCE && !existing.evidence.some((entry) => sameEvidence(entry, candidate.evidence))) {
      existing.evidence.push(candidate.evidence);
    }
    existing.inArea ||= candidate.inArea;
    if (candidate.distanceKm !== null && (existing.distanceKm === null || candidate.distanceKm < existing.distanceKm)) {
      existing.distanceKm = candidate.distanceKm;
    }
  }
  return Array.from(byKey.values());
}

/** The score parts of a merged company against the profile's keywords. */
export function partsOf(merged: Pick<Merged, 'name' | 'sources' | 'evidence' | 'distanceKm' | 'inArea'>, keywords: string[]): ScoreParts {
  const text = [merged.name, ...merged.evidence.map((entry) => entry.snippet)].join(' ');
  return {
    sources: Array.from(new Set(merged.sources)),
    keywords: keywordHits(keywords, text),
    keywordTotal: keywords.length,
    distanceKm: merged.distanceKm === null ? null : Math.round(merged.distanceKm * 10) / 10,
    inArea: merged.inArea,
    nafMatch: merged.sources.includes('BODACC'),
  };
}

/** Reads stored evidence back, dropping malformed entries. */
export function evidenceOf(value: unknown): Evidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { source, snippet, url } = entry as Record<string, unknown>;
    if (typeof source !== 'string' || typeof snippet !== 'string') return [];
    return [{ source: source as CompetitorSuggestionSource, snippet, url: typeof url === 'string' ? url : null }];
  });
}
