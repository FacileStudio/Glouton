import type { Key } from '$lib/i18n/rows';
import type { useT } from '$lib/i18n';

type Translate = ReturnType<typeof useT>;

export type Stage = 'PROSPECT' | 'CONTACTED' | 'CLIENT' | 'PARTNER' | 'PERSONAL';
export type Temperature = 'HOT' | 'WARM' | 'COLD';
export type Origin = 'HUNT' | 'CSV' | 'MANUAL' | 'ARDOISE' | 'COURRIER' | 'AGENT';
export type Tone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger';

export const STAGES: Array<{ value: Stage; label: Key; tone: Tone }> = [
  { value: 'PROSPECT', label: 'stage.PROSPECT', tone: 'neutral' },
  { value: 'CONTACTED', label: 'stage.CONTACTED', tone: 'info' },
  { value: 'CLIENT', label: 'stage.CLIENT', tone: 'success' },
  { value: 'PARTNER', label: 'stage.PARTNER', tone: 'accent' },
  { value: 'PERSONAL', label: 'stage.PERSONAL', tone: 'warning' },
];

export const TEMPERATURES: Array<{ value: Temperature; label: Key; tone: Tone }> = [
  { value: 'HOT', label: 'temp.HOT', tone: 'danger' },
  { value: 'WARM', label: 'temp.WARM', tone: 'warning' },
  { value: 'COLD', label: 'temp.COLD', tone: 'info' },
];

export const ORIGINS: Array<{ value: Origin; label: Key }> = [
  { value: 'HUNT', label: 'origin.HUNT' },
  { value: 'CSV', label: 'origin.CSV' },
  { value: 'MANUAL', label: 'origin.MANUAL' },
  { value: 'ARDOISE', label: 'origin.ARDOISE' },
  { value: 'COURRIER', label: 'origin.COURRIER' },
  { value: 'AGENT', label: 'origin.AGENT' },
];

const SUGGESTION_KINDS: Record<string, Key> = {
  DRAFT: 'kind.DRAFT',
  FOLLOW_UP: 'kind.FOLLOW_UP',
  RESCORE: 'kind.RESCORE',
  NEXT_ACTION: 'kind.NEXT_ACTION',
  MATCH: 'kind.MATCH',
  IMPORT: 'kind.IMPORT',
};

export function suggestionLabel(kind: string | null | undefined, t: Translate): string {
  const key = SUGGESTION_KINDS[kind ?? ''];
  return key ? t(key) : (kind ?? '');
}

export function stageOf(value: string) {
  return STAGES.find((s) => s.value === value) ?? STAGES[0]!;
}

export function temperatureOf(value: string | null | undefined) {
  return TEMPERATURES.find((t) => t.value === value) ?? null;
}

export function originLabel(value: string, t: Translate): string {
  const key = ORIGINS.find((o) => o.value === value)?.label;
  return key ? t(key) : value;
}

export function personName(p: { firstName?: string | null; lastName?: string | null; email?: string | null }, t: Translate): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || t('common.unnamed');
}
