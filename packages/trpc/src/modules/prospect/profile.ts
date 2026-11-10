import type { Prisma, PrismaClient, TeamProspectProfile } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { isOsmTag, tagsForCategory } from '../../taxonomy';
import type { Scope } from '../../utils/scope';
import { domainOf } from '../competitor/rules';
import { JOB_CONTRACTS, type JobContract } from '../job/filters';

/** What a space uses Glouton for. Several can be on at once. */
export const USAGES = ['clients', 'competitors', 'missions', 'partners', 'job'] as const;
export type Usage = (typeof USAGES)[number];

/** The usages with a target description of their own. */
export const TARGET_USAGES = ['clients', 'competitors', 'missions', 'partners', 'job'] as const;
export type TargetUsage = (typeof TARGET_USAGES)[number];

/**
 * What a job seeker looks for. It extends a target: `description` says the
 * job in their words and `keywords` are their skills; `role`, `location`,
 * `remote`, `contracts` and `salaryMin` fill a job search. The location is
 * the job's, not the space's `area`.
 */
export interface JobTarget extends Target {
  role: string | null;
  location: string | null;
  remote: boolean;
  contracts: JobContract[];
  salaryMin: number | null;
}

export type Targets = Record<Exclude<TargetUsage, 'job'>, Target> & { job: JobTarget };

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
  targets: Targets;
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

export const jobTargetSchema = targetSchema.extend({
  role: z.string().trim().max(200).nullish(),
  location: z.string().trim().max(200).nullish(),
  remote: z.boolean().default(false),
  contracts: z.array(z.enum(JOB_CONTRACTS)).max(JOB_CONTRACTS.length).default([]),
  salaryMin: z.number().int().min(0).max(10_000_000).nullish(),
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
  targets: z
    .object({ clients: targetSchema, competitors: targetSchema, missions: targetSchema, partners: targetSchema, job: jobTargetSchema })
    .partial()
    .optional(),
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

function emptyJob(): JobTarget {
  return { ...emptyTarget(), role: null, location: null, remote: false, contracts: [], salaryMin: null };
}

function cleanTarget(input: z.input<typeof targetSchema> | Target): Target {
  return {
    description: input.description?.trim() || null,
    nafCodes: unique((input.nafCodes ?? []).map((code) => code.trim().toUpperCase())),
    osmTags: unique(input.osmTags ?? []),
    keywords: unique((input.keywords ?? []).map((keyword) => keyword.trim().toLowerCase()).filter(Boolean)),
  };
}

function cleanJob(input: z.input<typeof jobTargetSchema> | JobTarget): JobTarget {
  return {
    ...cleanTarget(input),
    role: input.role?.trim() || null,
    location: input.location?.trim() || null,
    remote: input.remote ?? false,
    contracts: unique(input.contracts ?? []),
    salaryMin: input.salaryMin ?? null,
  };
}

type LegacyColumns = Pick<TeamProspectProfile, 'targetCategories' | 'nafCodes' | 'keywords' | 'ownCategory'>;

/**
 * The targets an old profile meant. Its customer categories become the
 * clients' map tags; its own category becomes the competitors' map tags;
 * its NAF codes and keywords described customers and also fed competitor
 * search, so both usages keep them.
 */
export function legacyTargets(row: LegacyColumns): Targets {
  const shared = { nafCodes: unique(row.nafCodes), keywords: unique(row.keywords) };
  return {
    clients: { description: null, osmTags: unique(row.targetCategories.flatMap(tagsForCategory)), ...shared },
    competitors: { description: null, osmTags: row.ownCategory ? tagsForCategory(row.ownCategory) : [], ...shared },
    missions: emptyTarget(),
    partners: emptyTarget(),
    job: emptyJob(),
  };
}

function storedTargets(value: Prisma.JsonValue | undefined): Partial<Targets> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: Partial<Targets> = {};
  for (const usage of TARGET_USAGES) {
    if (usage === 'job') continue;
    const parsed = targetSchema.safeParse(raw[usage]);
    if (parsed.success) out[usage] = cleanTarget(parsed.data);
  }
  const job = jobTargetSchema.safeParse(raw.job);
  if (job.success) out.job = cleanJob(job.data);
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
export function searchProfile(profile: ProspectProfile, usage: Exclude<TargetUsage, 'job'>): SearchProfile {
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
    if (usage === 'job') continue;
    const next = fields.targets?.[usage];
    if (next) targets[usage] = cleanTarget(next);
  }
  if (fields.targets?.job) targets.job = cleanJob(fields.targets.job);
  const usages = unique(fields.usages ?? current.usages);
  if (usages.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pick at least one usage' });
  const data = {
    usages,
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
