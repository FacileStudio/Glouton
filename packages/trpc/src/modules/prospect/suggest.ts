import { z } from 'zod';
import type { BulleClient } from '../assistant/bulle';
import { jsonObject } from '../assistant/prompt';
import { requireBulle } from '../assistant/service';
import { aiError, requireAiAccess } from '../competitor-ai/service';
import { AiOutputError, systemFor, type AiLanguage } from '../competitor-ai/prompt';
import type { ForfaitReader } from '../forfait/store';
import { isOsmTag, normalizeNaf } from '../../taxonomy';
import type { Scope } from '../../utils/scope';
import { TARGET_USAGES, type TargetUsage } from './profile';

/** What Bulle proposes for one usage. The user accepts or discards each item; nothing is saved here. */
export interface TargetSuggestion {
  nafCodes: string[];
  osmTags: string[];
  keywords: string[];
}

const MAX_NAF = 5;
const MAX_TAGS = 6;
const MAX_KEYWORDS = 6;

export const suggestTargetsSchema = z.object({
  teamId: z.string().uuid().optional(),
  usage: z.enum(TARGET_USAGES),
  language: z.enum(['fr', 'en', 'es', 'de']),
  offer: z.string().trim().max(4000).optional(),
  description: z.string().trim().max(2000).optional(),
  area: z.string().trim().max(200).optional(),
});

const GOALS: Record<TargetUsage, string> = {
  clients: 'The filters must find businesses that would buy what the user offers.',
  competitors: 'The filters must find businesses that offer the same thing as the user: its competitors.',
  missions: 'The filters must find businesses that hire freelancers for work like what the user does.',
  partners: 'The filters must find suppliers and partners the user could work with.',
  job: [
    'The user looks for a job, in any trade, not only in tech.',
    '"keywords" must be the skills and job titles employers write in offers for that job.',
    '"nafCodes" are the sectors that hire for that job. Leave "osmTags" empty.',
  ].join(' '),
};

const RULES = [
  'In Glouton you turn a short business description into search filters.',
  'Answer with strict JSON only, no prose around it:',
  '{"nafCodes": string[], "osmTags": string[], "keywords": string[]}.',
  `"nafCodes": at most ${MAX_NAF} French NAF rév. 2 subclass codes written like 62.01Z.`,
  `"osmTags": at most ${MAX_TAGS} OpenStreetMap tags written key=value, with a key among office, shop, craft, amenity, healthcare, tourism and leisure.`,
  `"keywords": at most ${MAX_KEYWORDS} short web search phrases of two to five words.`,
  'Only use codes and tags that really exist. Leave a list empty rather than guess.',
].join('\n');

const answerSchema = z.object({
  nafCodes: z.array(z.unknown()).default([]),
  osmTags: z.array(z.unknown()).default([]),
  keywords: z.array(z.unknown()).default([]),
});

function strings(values: unknown[]): string[] {
  return values.filter((value): value is string => typeof value === 'string');
}

/**
 * Reads Bulle's JSON answer. Unknown NAF codes and map tags are dropped,
 * codes are normalized (6201z gives 62.01Z), keywords are trimmed and
 * lower-cased, and every list is deduplicated and capped. An answer that is
 * not a JSON object with those lists throws AiOutputError.
 */
export function parseTargetSuggestion(raw: string): TargetSuggestion {
  const json = jsonObject(raw);
  const parsed = json ? answerSchema.safeParse(json) : null;
  if (!parsed?.success) throw new AiOutputError();
  const nafCodes = strings(parsed.data.nafCodes).flatMap((code) => normalizeNaf(code) ?? []);
  const osmTags = strings(parsed.data.osmTags).map((tag) => tag.trim().toLowerCase()).filter(isOsmTag);
  const keywords = strings(parsed.data.keywords)
    .map((keyword) => keyword.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter((keyword) => keyword.length > 0 && keyword.length <= 60);
  return {
    nafCodes: Array.from(new Set(nafCodes)).slice(0, MAX_NAF),
    osmTags: Array.from(new Set(osmTags)).slice(0, MAX_TAGS),
    keywords: Array.from(new Set(keywords)).slice(0, MAX_KEYWORDS),
  };
}

/** The user message: what the space does and who it looks for, as plain lines. */
export function suggestionPrompt(input: { usage: TargetUsage; offer?: string; description?: string; area?: string }): string {
  const lines = [
    input.offer ? `What the user does: ${input.offer}` : null,
    input.description ? `Who the user looks for: ${input.description}` : null,
    input.area ? `Area: ${input.area}` : null,
  ];
  return `${GOALS[input.usage]}\n\n${lines.filter(Boolean).join('\n')}`;
}

/**
 * Asks Bulle for NAF codes, map tags and keywords from the texts the user
 * typed. The scope's plan must carry ai.access (checked before any call,
 * with the same refusal Bulle's 402 gives); Bulle's own refusals map the
 * same way.
 */
export async function suggestTargets(
  deps: { bulle: BulleClient | null; forfait: ForfaitReader },
  scope: Scope,
  input: { usage: TargetUsage; language: AiLanguage; offer?: string; description?: string; area?: string }
): Promise<TargetSuggestion> {
  const client = requireBulle(deps.bulle);
  await requireAiAccess(deps.forfait, scope);
  if (!input.offer && !input.description) return { nafCodes: [], osmTags: [], keywords: [] };
  try {
    const offer = await client.offer(scope.userId);
    const raw = await client.complete(scope.userId, offer, {
      system: systemFor(offer.persona, RULES, input.language),
      user: suggestionPrompt(input),
      maxTokens: 800,
    });
    return parseTargetSuggestion(raw);
  } catch (error) {
    return aiError(error);
  }
}
