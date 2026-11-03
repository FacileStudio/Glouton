import type { Prisma } from '@prisma/client';

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
