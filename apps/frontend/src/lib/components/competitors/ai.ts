import type { Objection } from './labels';

export type AiLanguage = 'fr' | 'en' | 'es' | 'de';

/** The language Bulle writes in: the interface language when Bulle supports it, else French. */
export function aiLanguage(locale: string): AiLanguage {
  return locale === 'en' || locale === 'es' || locale === 'de' ? locale : 'fr';
}

export interface BattlecardFields {
  overview: string | null;
  whyWeWin: string[];
  whyWeLose: string[];
  objections: Objection[];
  landmines: string[];
  pricing: string | null;
  proofPoints: string[];
}

export type DraftField = keyof BattlecardFields;

export const DRAFT_FIELDS: readonly DraftField[] = ['overview', 'pricing', 'whyWeWin', 'whyWeLose', 'objections', 'landmines', 'proofPoints'];

const TEXT_FIELDS: ReadonlySet<DraftField> = new Set(['overview', 'pricing']);

const MAX_ITEMS = 50;

function lineKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Whether the proposal adds anything to the current value; empty or identical proposals are not shown. */
export function hasNews(field: DraftField, current: BattlecardFields, proposed: BattlecardFields): boolean {
  if (TEXT_FIELDS.has(field)) {
    const next = (proposed[field] as string | null)?.trim();
    return Boolean(next) && next !== (current[field] as string | null)?.trim();
  }
  return addedItems(field, current, proposed).length > 0;
}

/** The proposed list items that the current list does not already hold. */
export function addedItems(field: DraftField, current: BattlecardFields, proposed: BattlecardFields): Array<string | Objection> {
  if (field === 'objections') {
    const known = new Set(current.objections.map((item) => lineKey(item.objection)));
    return proposed.objections.filter((item) => !known.has(lineKey(item.objection)));
  }
  const known = new Set((current[field] as string[]).map(lineKey));
  return (proposed[field] as string[]).filter((item) => !known.has(lineKey(item)));
}

/**
 * The value written when the user accepts one field. Lists keep every
 * existing item and append the new ones, so user content is never dropped;
 * a text field takes the proposal, which the user saw next to the current
 * text before accepting.
 */
export function acceptedValue(field: DraftField, current: BattlecardFields, proposed: BattlecardFields): Partial<BattlecardFields> {
  if (TEXT_FIELDS.has(field)) return { [field]: proposed[field] } as Partial<BattlecardFields>;
  if (field === 'objections') {
    return { objections: [...current.objections, ...(addedItems(field, current, proposed) as Objection[])].slice(0, MAX_ITEMS) };
  }
  return { [field]: [...(current[field] as string[]), ...(addedItems(field, current, proposed) as string[])].slice(0, MAX_ITEMS) } as Partial<BattlecardFields>;
}
