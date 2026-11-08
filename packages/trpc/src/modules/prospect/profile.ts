import type { PrismaClient, TeamProspectProfile } from '@prisma/client';
import { z } from 'zod';
import { businessCategoryEnum } from '../lead/schemas';
import type { Scope } from '../../utils/scope';
import { domainOf } from '../competitor/rules';

/**
 * A space's prospecting profile: what it sells (`offerDescription`), where
 * (`area`, a place name hunts can search around), and to whom
 * (`targetCategories` from the hunt category list, `nafCodes`, `keywords`).
 * `website` is the space's own site (a bare domain) and `ownCategory` the
 * map category the space itself belongs to: competitor discovery searches
 * sites like the first and places of the second. There is one per team and
 * one per person for the personal space. Automatic hunts turn the categories
 * into schedules; competitor discovery reads the whole profile through
 * `profileFor`.
 */
export interface ProspectProfile {
  offerDescription: string | null;
  area: string | null;
  targetCategories: z.infer<typeof businessCategoryEnum>[];
  nafCodes: string[];
  keywords: string[];
  website: string | null;
  ownCategory: z.infer<typeof businessCategoryEnum> | null;
  updatedAt: Date | null;
}

const NAF_CODE = /^\d{2}(\.\d{1,2}[A-Z]?)?$/;

/** The fields a save may write. Lists are trimmed, deduplicated and capped. */
export const profileFieldsSchema = z.object({
  offerDescription: z.string().trim().max(4000).nullish(),
  area: z.string().trim().max(200).nullish(),
  targetCategories: z.array(businessCategoryEnum).max(20).optional(),
  nafCodes: z
    .array(z.string().trim().toUpperCase().regex(NAF_CODE, 'NAF codes look like 62.01Z'))
    .max(30)
    .optional(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  website: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .refine((value) => !value || domainOf(value) !== null, 'Use a web address such as monsite.fr'),
  ownCategory: businessCategoryEnum.nullish(),
});

export type ProfileFields = z.infer<typeof profileFieldsSchema>;

/** The unique key of a scope's profile row: `team:<id>` or `user:<id>`. */
export function scopeKey(scope: Scope): string {
  return scope.type === 'team' ? `team:${scope.teamId}` : `user:${scope.userId}`;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function present(row: TeamProspectProfile | null): ProspectProfile {
  const categories = (row?.targetCategories ?? []).flatMap((value) => {
    const parsed = businessCategoryEnum.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  return {
    offerDescription: row?.offerDescription ?? null,
    area: row?.area ?? null,
    targetCategories: categories,
    nafCodes: row?.nafCodes ?? [],
    keywords: row?.keywords ?? [],
    website: row?.website ?? null,
    ownCategory: businessCategoryEnum.safeParse(row?.ownCategory).data ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

/** The profile of a scope the caller already resolved; an empty profile when none was saved. */
export async function profileFor(prisma: PrismaClient, scope: Scope): Promise<ProspectProfile> {
  return present(await prisma.teamProspectProfile.findUnique({ where: { scopeKey: scopeKey(scope) } }));
}

/** Creates or updates a scope's profile with the given fields; empty text becomes null. */
export async function saveProfile(prisma: PrismaClient, scope: Scope, fields: ProfileFields): Promise<ProspectProfile> {
  const data = {
    ...(fields.offerDescription !== undefined ? { offerDescription: fields.offerDescription || null } : {}),
    ...(fields.area !== undefined ? { area: fields.area || null } : {}),
    ...(fields.targetCategories ? { targetCategories: unique(fields.targetCategories) } : {}),
    ...(fields.nafCodes ? { nafCodes: unique(fields.nafCodes) } : {}),
    ...(fields.keywords ? { keywords: unique(fields.keywords.map((k) => k.toLowerCase())) } : {}),
    ...(fields.website !== undefined ? { website: domainOf(fields.website) } : {}),
    ...(fields.ownCategory !== undefined ? { ownCategory: fields.ownCategory || null } : {}),
  };
  const key = scopeKey(scope);
  const row = await prisma.teamProspectProfile.upsert({
    where: { scopeKey: key },
    create: { ...data, scopeKey: key, userId: scope.userId, teamId: scope.type === 'team' ? scope.teamId : null },
    update: data,
  });
  return present(row);
}
