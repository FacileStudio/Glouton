import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { businessCategoryEnum } from '../modules/lead/schemas';

type JsonRecord = Record<string, Prisma.JsonValue>;

export interface SocialProfile {
  platform: string;
  url: string;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export type CompanyInfo = Partial<Record<'name' | 'description' | 'industry' | 'size' | 'founded' | 'website', string>>;

const COMPANY_INFO_FIELDS = ['name', 'description', 'industry', 'size', 'founded', 'website'] as const;

/**
 * Narrows a Prisma JSON value to a plain object.
 */
export function isJsonRecord(value: Prisma.JsonValue | undefined): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Keeps the string-valued entries of a JSON object, or returns null when the value is not an object.
 */
export function readStringRecord(value: Prisma.JsonValue): Record<string, string> | null {
  if (!isJsonRecord(value)) return null;
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

/**
 * Reads a lead's social profiles column, dropping entries without a string platform and url.
 */
export function readSocialProfiles(value: Prisma.JsonValue): SocialProfile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    isJsonRecord(item) && typeof item.platform === 'string' && typeof item.url === 'string'
      ? [{ platform: item.platform, url: item.url }]
      : []
  );
}

/**
 * Reads a lead's coordinates column, or null when lat and lng are not both numbers.
 */
export function readCoordinates(value: Prisma.JsonValue): Coordinates | null {
  if (!isJsonRecord(value) || typeof value.lat !== 'number' || typeof value.lng !== 'number') return null;
  return { lat: value.lat, lng: value.lng };
}

/**
 * Reads a lead's company info column, keeping only the known string fields.
 */
export function readCompanyInfo(value: Prisma.JsonValue): CompanyInfo | null {
  if (!isJsonRecord(value)) return null;
  const info: CompanyInfo = {};
  for (const field of COMPANY_INFO_FIELDS) {
    const fieldValue = value[field];
    if (typeof fieldValue === 'string') info[field] = fieldValue;
  }
  return info;
}

export interface HuntFilters {
  location?: string;
  domain?: string;
  radius?: number;
  maxResults?: number;
  hasWebsite?: boolean;
  categories?: z.infer<typeof businessCategoryEnum>[];
}

export interface SourceStat {
  leads?: number;
  errors?: number;
  rateLimited?: boolean;
}

const HUNT_FILTER_STRINGS = ['location', 'domain'] as const;
const HUNT_FILTER_NUMBERS = ['radius', 'maxResults'] as const;

function readCategories(value: JsonRecord): HuntFilters['categories'] {
  const raw = Array.isArray(value.categories) ? value.categories : [value.category];
  const categories = raw.flatMap((item) => {
    const parsed = businessCategoryEnum.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  return categories.length > 0 ? categories : undefined;
}

/**
 * Reads a hunt session's filters column, keeping only the known fields with the expected types.
 * A legacy single `category` is folded into `categories`.
 */
export function readHuntFilters(value: Prisma.JsonValue): HuntFilters | null {
  if (!isJsonRecord(value)) return null;
  const filters: HuntFilters = {};
  for (const key of HUNT_FILTER_STRINGS) {
    const field = value[key];
    if (typeof field === 'string') filters[key] = field;
  }
  for (const key of HUNT_FILTER_NUMBERS) {
    const field = value[key];
    if (typeof field === 'number') filters[key] = field;
  }
  const categories = readCategories(value);
  if (categories) filters.categories = categories;
  if (typeof value.hasWebsite === 'boolean') filters.hasWebsite = value.hasWebsite;
  return filters;
}

/**
 * Reads a hunt session's per-source statistics column.
 */
export function readSourceStats(value: Prisma.JsonValue): Record<string, SourceStat> {
  if (!isJsonRecord(value)) return {};
  const stats: Record<string, SourceStat> = {};
  for (const [source, raw] of Object.entries(value)) {
    if (!isJsonRecord(raw)) continue;
    stats[source] = {
      leads: typeof raw.leads === 'number' ? raw.leads : undefined,
      errors: typeof raw.errors === 'number' ? raw.errors : undefined,
      rateLimited: typeof raw.rateLimited === 'boolean' ? raw.rateLimited : undefined,
    };
  }
  return stats;
}

type LeadJsonColumns = Pick<Prisma.LeadGetPayload<object>, 'socialProfiles' | 'coordinates' | 'companyInfo'>;

/**
 * Replaces a lead's untyped JSON columns with their validated shapes.
 */
export function withTypedJson<T extends LeadJsonColumns>(
  lead: T
): Omit<T, keyof LeadJsonColumns> & { socialProfiles: SocialProfile[]; coordinates: Coordinates | null; companyInfo: CompanyInfo | null } {
  return {
    ...lead,
    socialProfiles: readSocialProfiles(lead.socialProfiles),
    coordinates: readCoordinates(lead.coordinates),
    companyInfo: readCompanyInfo(lead.companyInfo),
  };
}

/**
 * Narrows a row's JSON payload to its string fields, which keeps inferred tRPC outputs shallow.
 */
export function withStringPayload<R extends { payload: Prisma.JsonValue }>(
  row: R
): Omit<R, 'payload'> & { payload: Record<string, string> | null } {
  return { ...row, payload: readStringRecord(row.payload) };
}
