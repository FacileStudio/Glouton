import { taxonomyLabel, type TaxonomyLocale } from '@repo/trpc/taxonomy';

/** Who one usage looks for, as the profile form edits it. */
export interface Target {
  description: string | null;
  nafCodes: string[];
  osmTags: string[];
  keywords: string[];
}

export type TargetList = 'nafCodes' | 'osmTags' | 'keywords';

/** What Bulle proposed and the user has not decided yet. */
export type Suggestion = Pick<Target, TargetList>;

export function emptySuggestion(): Suggestion {
  return { nafCodes: [], osmTags: [], keywords: [] };
}

export function hasSuggestion(suggestion: Suggestion): boolean {
  return suggestion.nafCodes.length + suggestion.osmTags.length + suggestion.keywords.length > 0;
}

/** The target with one accepted item added once. */
export function addSuggestion(target: Target, list: TargetList, value: string): Target {
  return target[list].includes(value) ? target : { ...target, [list]: [...target[list], value] };
}

export function removeChip(target: Target, list: TargetList, value: string): Target {
  return { ...target, [list]: target[list].filter((entry) => entry !== value) };
}

/** A chip's text: NAF codes keep their code, map tags show their label, keywords show as typed. */
export function chipLabel(list: TargetList, value: string, locale: TaxonomyLocale): string {
  if (list === 'keywords') return value;
  const label = taxonomyLabel(value, locale);
  if (!label) return value;
  return list === 'nafCodes' ? `${value} · ${label}` : label;
}

/** The label of a hunt category: a map tag's label, or null for an old category the caller labels itself. */
export function tagLabel(value: string, locale: TaxonomyLocale): string | null {
  return value.includes('=') ? taxonomyLabel(value, locale) : null;
}
