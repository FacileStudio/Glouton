import type { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import type { BulleClient } from '../assistant/bulle';
import { jsonObject } from '../assistant/prompt';
import { assistantError, requireBulle } from '../assistant/service';
import { businessCategoryEnum } from '../lead/schemas';
import { profileFor, type ProspectProfile } from '../prospect/profile';
import type { Scope } from '../../utils/scope';

type Category = z.infer<typeof businessCategoryEnum>;

/** One target segment Bulle proposes: a ready schedule once the user picks a frequency. */
export interface Segment {
  name: string;
  categories: Category[];
  location: string;
  rationale: string | null;
}

const MAX_SEGMENTS = 5;

const RULES = [
  'In Glouton you help a business choose which local businesses to prospect.',
  'Each segment becomes an automatic OpenStreetMap search for businesses of the given categories around a place.',
  `Use only these category ids: ${businessCategoryEnum.options.join(', ')}.`,
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
  const lines = [
    profile.offerDescription ? `Offer: ${profile.offerDescription}` : null,
    profile.area ? `Area: ${profile.area}` : null,
    profile.targetCategories.length ? `Current target categories: ${profile.targetCategories.join(', ')}` : null,
    profile.nafCodes.length ? `NAF codes: ${profile.nafCodes.join(', ')}` : null,
    profile.keywords.length ? `Keywords: ${profile.keywords.join(', ')}` : null,
  ];
  return `# Prospecting profile\n${lines.filter(Boolean).join('\n')}\n\nPropose target segments.`;
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

/** Reads Bulle's JSON answer, keeping only segments with known categories and a place; the area fills a missing place. */
export function parseSegments(raw: string, area: string | null): Segment[] {
  const list = jsonObject(raw)?.segments;
  if (!Array.isArray(list)) return [];
  return list
    .flatMap((item: unknown) => {
      const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const categories = Array.isArray(entry.categories)
        ? Array.from(new Set(entry.categories.flatMap((c) => (businessCategoryEnum.safeParse(c).success ? [c as Category] : []))))
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
  if (!profile.offerDescription && profile.targetCategories.length === 0 && profile.keywords.length === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Describe your offer in the prospecting profile first' });
  }
  try {
    const offer = await client.offer(scope.userId);
    const raw = await client.complete(scope.userId, offer, {
      system: [offer.persona.trim(), RULES, languageRule(language)].filter(Boolean).join('\n\n'),
      user: segmentsPrompt(profile),
      maxTokens: 1200,
    });
    return parseSegments(raw, profile.area);
  } catch (error) {
    return assistantError(error);
  }
}
