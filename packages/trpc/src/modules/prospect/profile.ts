import type { Prisma, PrismaClient, TeamProspectProfile } from '@prisma/client';
import { z } from 'zod';
import { isOsmTag, tagsForCategory } from '../../taxonomy';
import type { Scope } from '../../utils/scope';
import { domainOf } from '../competitor/rules';

/**
 * What a space uses Glouton for. Several can be on at once. `job` is
 * reserved for job search, which is not built yet: it can be stored but
 * drives nothing.
 */
export const USAGES = ['clients', 'competitors', 'missions', 'partners', 'job'] as const;
export type Usage = (typeof USAGES)[number];

/** The usages with a target description of their own. */
export const TARGET_USAGES = ['clients', 'competitors', 'missions', 'partners'] as const;
export type TargetUsage = (typeof TARGET_USAGES)[number];

/** What an existing profile did before usages existed. */
const LEGACY_USAGES: Usage[] = ['clients', 'competitors'];

/**
 * Who a usage looks for: free text for web search, NAF codes for BODACC,
 * OpenStreetMap tags for the map, and keywords.
 */
export interface Target {
  description: string | null;
  nafCodes: string[];
  osmTags: string[];
  keywords: string[];
}

/**
 * A space's profile: what it does (`offerDescription`, `website`), where
 * (`area`, or `remote`), what it uses Glouton for (`usages`) and, per
 * usage, who it looks for (`targets`). One per team and one per person for
 * the personal space. `onboarded` is false until the first save, which the
 * start wizard makes. Profiles saved before usages existed read as clients plus
 * competitors, with their old categories mapped to map tags.
 */
export interface ProspectProfile {
  usages: Usage[];
  onboarded: boolean;
  offerDescription: string | null;
  website: string | null;
  area: string | null;
  remote: boolean;
  targets: Record<TargetUsage, Target>;
  updatedAt: Date | null;
}

/** What a search engine needs from a profile for one usage. */
export interface SearchProfile extends Target {
  offerDescription: string | null;
  area: string | null;
  website: string | null;
}

const NAF_CODE = /^\d{2}(\.\d{1,2}[A-Z]?)?$/;

const nafCodes = z
  .array(z.string().trim().toUpperCase().regex(NAF_CODE, 'NAF codes look like 62.01Z'))
  .max(30);

const osmTags = z.array(z.string().trim().refine(isOsmTag, 'Pick map tags from the list')).max(30);

export const targetSchema = z.object({
  description: z.string().trim().max(2000).nullish(),
  nafCodes: nafCodes.default([]),
  osmTags: osmTags.default([]),
  keywords: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
});

/** The fields a save may write. Lists are trimmed, deduplicated and capped. */
export const profileFieldsSchema = z.object({
  usages: z.array(z.enum(USAGES)).min(1, 'Pick at least one usage').max(USAGES.length).optional(),
  offerDescription: z.string().trim().max(4000).nullish(),
  area: z.string().trim().max(200).nullish(),
  remote: z.boolean().optional(),
  website: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .refine((value) => !value || domainOf(value) !== null, 'Use a web address such as monsite.fr'),
  targets: z.object({ clients: targetSchema, competitors: targetSchema, missions: targetSchema, partners: targetSchema }).partial().optional(),
});

export type ProfileFields = z.infer<typeof profileFieldsSchema>;

/** The unique key of a scope's profile row: `team:<id>` or `user:<id>`. */
export function scopeKey(scope: Scope): string {
  return scope.type === 'team' ? `team:${scope.teamId}` : `user:${scope.userId}`;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function emptyTarget(): Target {
  return { description: null, nafCodes: [], osmTags: [], keywords: [] };
}

function cleanTarget(input: z.input<typeof targetSchema> | Target): Target {
  return {
    description: input.description?.trim() || null,
    nafCodes: unique((input.nafCodes ?? []).map((code) => code.trim().toUpperCase())),
    osmTags: unique(input.osmTags ?? []),
    keywords: unique((input.keywords ?? []).map((keyword) => keyword.trim().toLowerCase()).filter(Boolean)),
  };
}

type LegacyColumns = Pick<TeamProspectProfile, 'targetCategories' | 'nafCodes' | 'keywords' | 'ownCategory'>;

/**
 * The targets an old profile meant. Its customer categories become the
 * clients' map tags; its own category becomes the competitors' map tags;
 * its NAF codes and keywords described customers and also fed competitor
 * search, so both usages keep them.
 */
export function legacyTargets(row: LegacyColumns): Record<TargetUsage, Target> {
  const shared = { nafCodes: unique(row.nafCodes), keywords: unique(row.keywords) };
  return {
    clients: { description: null, osmTags: unique(row.targetCategories.flatMap(tagsForCategory)), ...shared },
    competitors: { description: null, osmTags: row.ownCategory ? tagsForCategory(row.ownCategory) : [], ...shared },
    missions: emptyTarget(),
    partners: emptyTarget(),
  };
}

function storedTargets(value: Prisma.JsonValue | undefined): Partial<Record<TargetUsage, Target>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Partial<Record<TargetUsage, Target>> = {};
  for (const usage of TARGET_USAGES) {
    const parsed = targetSchema.safeParse((value as Record<string, unknown>)[usage]);
    if (parsed.success) out[usage] = cleanTarget(parsed.data);
  }
  return out;
}

/** Reads a stored row, folding the pre-usage columns in when the new ones are empty. */
export function present(row: TeamProspectProfile | null): ProspectProfile {
  const legacy = row ? legacyTargets(row) : legacyTargets({ targetCategories: [], nafCodes: [], keywords: [], ownCategory: null });
  const stored = storedTargets(row?.targets);
  const usages = (row?.usages ?? []).filter((usage): usage is Usage => (USAGES as readonly string[]).includes(usage));
  return {
    usages: row && usages.length === 0 ? [...LEGACY_USAGES] : usages,
    onboarded: Boolean(row),
    offerDescription: row?.offerDescription ?? null,
    website: row?.website ?? null,
    area: row?.area ?? null,
    remote: row?.remote ?? false,
    targets: { ...legacy, ...stored },
    updatedAt: row?.updatedAt ?? null,
  };
}

/** The profile seen through one usage: the shared fields plus that usage's target. */
export function searchProfile(profile: ProspectProfile, usage: TargetUsage): SearchProfile {
  return { ...profile.targets[usage], offerDescription: profile.offerDescription, area: profile.area, website: profile.website };
}

/** The profile of a scope the caller already resolved; an empty profile when none was saved. */
export async function profileFor(prisma: PrismaClient, scope: Scope): Promise<ProspectProfile> {
  return present(await prisma.teamProspectProfile.findUnique({ where: { scopeKey: scopeKey(scope) } }));
}

/**
 * Creates or updates a scope's profile with the given fields; empty text
 * becomes null. Targets merge per usage over what the profile reads today,
 * so the first save also writes an old profile's mapped targets.
 */
export async function saveProfile(prisma: PrismaClient, scope: Scope, fields: ProfileFields): Promise<ProspectProfile> {
  const key = scopeKey(scope);
  const current = present(await prisma.teamProspectProfile.findUnique({ where: { scopeKey: key } }));
  const targets = { ...current.targets };
  for (const usage of TARGET_USAGES) {
    const next = fields.targets?.[usage];
    if (next) targets[usage] = cleanTarget(next);
  }
  const data = {
    usages: unique(fields.usages ?? current.usages),
    targets: targets as unknown as Prisma.InputJsonValue,
    ...(fields.offerDescription !== undefined ? { offerDescription: fields.offerDescription || null } : {}),
    ...(fields.area !== undefined ? { area: fields.area || null } : {}),
    ...(fields.remote !== undefined ? { remote: fields.remote } : {}),
    ...(fields.website !== undefined ? { website: domainOf(fields.website) } : {}),
  };
  const row = await prisma.teamProspectProfile.upsert({
    where: { scopeKey: key },
    create: { ...data, scopeKey: key, userId: scope.userId, teamId: scope.type === 'team' ? scope.teamId : null },
    update: data,
  });
  return present(row);
}
