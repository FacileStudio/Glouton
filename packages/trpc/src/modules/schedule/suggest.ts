import type { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { complete, type BulleClient } from '../assistant/bulle';
import { jsonObject } from '../assistant/prompt';
import { assistantError, requireBulle } from '../assistant/service';
import { isHuntCategory } from '../../taxonomy';
import { profileFor, type ProspectProfile } from '../prospect/profile';
import type { Scope } from '../../utils/scope';

/** One target segment Bulle proposes: a ready schedule once the user picks a frequency. */
export interface Segment {
  name: string;
  categories: string[];
  location: string;
  rationale: string | null;
}

const MAX_SEGMENTS = 5;

const RULES = [
  'In Glouton you help a business choose which local businesses to prospect.',
  'Each segment becomes an automatic OpenStreetMap search for businesses of the given categories around a place.',
  'Categories are OpenStreetMap tags written key=value, such as amenity=restaurant, craft=plumber or office=lawyer. Use only common tags under office, shop, craft, amenity, healthcare, tourism and leisure.',
  'Base the segments on the offer and targets given. Never invent facts about the user.',
  'Answer with strict JSON only, no prose around it:',
  '{"segments": [{"name": string, "categories": string[], "location": string, "rationale": string}]}.',
  `Give two to ${MAX_SEGMENTS} segments, each with one to three categories. "location" is a city or area name; use the profile area when it fits.`,
  '"name" is at most six words. "rationale" is one short sentence on why this segment needs the offer.',
].join('\n');

function languageRule(language: 'fr' | 'en'): string {
  return language === 'en' ? 'Write names and rationales in English.' : 'Write names and rationales in French.';
}

/** The user message: the profile as plain lines. */
export function segmentsPrompt(profile: ProspectProfile): string {
  const clients = profile.targets.clients;
  const lines = [
    profile.offerDescription ? `Offer: ${profile.offerDescription}` : null,
    profile.area ? `Area: ${profile.area}` : null,
    clients.description ? `Customers: ${clients.description}` : null,
    clients.osmTags.length ? `Current target tags: ${clients.osmTags.join(', ')}` : null,
    clients.nafCodes.length ? `NAF codes: ${clients.nafCodes.join(', ')}` : null,
    clients.keywords.length ? `Keywords: ${clients.keywords.join(', ')}` : null,
  ];
  return `# Prospecting profile\n${lines.filter(Boolean).join('\n')}`;
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

/** Reads Bulle's JSON answer, keeping only segments with known map tags and a place; the area fills a missing place. */
export function parseSegments(raw: string, area: string | null): Segment[] {
  const list = jsonObject(raw)?.segments;
  if (!Array.isArray(list)) return [];
  return list
    .flatMap((item: unknown) => {
      const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const categories = Array.isArray(entry.categories)
        ? Array.from(new Set(entry.categories.filter((c): c is string => typeof c === 'string' && isHuntCategory(c))))
        : [];
      const location = text(entry.location, 200) ?? area;
      const name = text(entry.name, 120);
      if (!name || !location || categories.length === 0) return [];
      return [{ name, categories: categories.slice(0, 3), location, rationale: text(entry.rationale, 300) }];
    })
    .slice(0, MAX_SEGMENTS);
}

/** Asks Bulle for target segments from the scope's profile. Bulle gates `ai.access`; its refusal carries the upgrade link. */
export async function suggestSegments(
  prisma: PrismaClient,
  bulle: BulleClient | null,
  scope: Scope,
  language: 'fr' | 'en'
): Promise<Segment[]> {
  const client = requireBulle(bulle);
  const profile = await profileFor(prisma, scope);
  const clients = profile.targets.clients;
  if (!profile.offerDescription && !clients.description && clients.osmTags.length === 0 && clients.keywords.length === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Describe your offer in the prospecting profile first' });
  }
  try {
    const raw = await complete(client, scope.userId, {
      system: [RULES, languageRule(language)].join('\n\n'),
      prompt: 'Propose target segments.',
      input: segmentsPrompt(profile),
      maxTokens: 1200,
    });
    return parseSegments(raw, profile.area);
  } catch (error) {
    return assistantError(error);
  }
}
