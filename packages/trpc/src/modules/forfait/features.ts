/**
 * Glouton's local mirror of github.com/FacileStudio/porte/forfait: plan
 * entitlements as JSON values (a bool, or an integer limit where -1 means
 * unlimited), read with a per-feature default. Malformed values never throw:
 * they read as the feature default.
 */

/** Whether a feature is an on/off switch or a counted limit. */
export type FeatureKind = 'bool' | 'limit';

/** One entitlement Glouton reads, with the value used when none was pushed. */
export interface Feature {
  key: string;
  kind: FeatureKind;
  default: boolean | number;
}

/** The whole app: false on Solo, true on Pro and Studio. */
export const GLOUTON_ACCESS: Feature = { key: 'glouton.access', kind: 'bool', default: false };

/** The assistant: Bulle gates its model proxy on it. Glouton only reports it. */
export const AI_ACCESS: Feature = { key: 'ai.access', kind: 'bool', default: false };

/** Every feature Glouton enforces. */
export const FEATURES: readonly Feature[] = [GLOUTON_ACCESS];

/** The entitlement key format shared across the suite. */
export const KEY_PATTERN = /^[a-z0-9_]+\.[a-z0-9_]+$/;

/** The most entitlement keys one scope may carry. */
export const MAX_KEYS = 200;

/** A scope's raw entitlements, as stored: anything JSON. */
export type Entitlements = Record<string, unknown>;

/** Raised by `check` when an addition would exceed a plan limit. */
export class LimitError extends Error {
  constructor(
    readonly key: string,
    readonly limit: number,
    readonly upgradeUrl: string
  ) {
    super('forfait: plan limit reached');
    this.name = 'LimitError';
  }
}

/**
 * Narrows an arbitrary stored value to a well-formed entitlements map, or
 * null when it is not an object, holds too many keys, or carries a key that
 * breaks the suite format. Individual values are checked on read.
 */
export function sanitize(raw: unknown): Entitlements | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length > MAX_KEYS || keys.some((key) => !KEY_PATTERN.test(key))) return null;
  return raw as Entitlements;
}

/** Reads a bool feature: true only for a literal `true`, else the default when the value is not a bool. */
export function enabled(raw: unknown, feature: Feature): boolean {
  const value = sanitize(raw)?.[feature.key];
  if (typeof value === 'boolean') return value;
  return feature.default === true;
}

/** Reads a limit feature: an integer >= -1, where -1 is unlimited; anything else reads as the default. */
export function limit(raw: unknown, feature: Feature): number {
  const value = sanitize(raw)?.[feature.key];
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= -1) return value;
  return typeof feature.default === 'number' ? feature.default : 0;
}

/**
 * Refuses an addition that would take `used` past the plan limit. Works on
 * bigints so `used + adding` cannot overflow; negative inputs count as zero.
 */
export function check(raw: unknown, feature: Feature, used: number, adding: number, upgradeUrl: string): void {
  const max = limit(raw, feature);
  if (max === -1) return;
  const total = BigInt(Math.max(0, Math.trunc(used))) + BigInt(Math.max(0, Math.trunc(adding)));
  if (total > BigInt(max)) throw new LimitError(feature.key, max, upgradeUrl);
}

/** Where a scope's owner buys or changes a plan: the space's Registre page, or the spaces list for personal work. */
export function upgradeUrl(issuer: string, registreSpaceId: string | null): string {
  const base = `${issuer.replace(/\/+$/, '')}/spaces`;
  return registreSpaceId ? `${base}/${encodeURIComponent(registreSpaceId)}` : base;
}
