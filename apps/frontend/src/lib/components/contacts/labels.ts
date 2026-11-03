import { toast } from '@facile/muse';

export type Stage = 'PROSPECT' | 'CONTACTED' | 'CLIENT' | 'PARTNER' | 'PERSONAL';
export type Temperature = 'HOT' | 'WARM' | 'COLD';
export type Origin = 'HUNT' | 'CSV' | 'MANUAL' | 'ARDOISE' | 'COURRIER' | 'AGENT';
export type Tone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger';

export const STAGES: Array<{ value: Stage; label: string; tone: Tone }> = [
  { value: 'PROSPECT', label: 'Prospect', tone: 'neutral' },
  { value: 'CONTACTED', label: 'Contacté', tone: 'info' },
  { value: 'CLIENT', label: 'Client', tone: 'success' },
  { value: 'PARTNER', label: 'Partenaire', tone: 'accent' },
  { value: 'PERSONAL', label: 'Réseau', tone: 'warning' },
];

export const TEMPERATURES: Array<{ value: Temperature; label: string; tone: Tone }> = [
  { value: 'HOT', label: 'Chaud', tone: 'danger' },
  { value: 'WARM', label: 'Tiède', tone: 'warning' },
  { value: 'COLD', label: 'Froid', tone: 'info' },
];

export const ORIGINS: Array<{ value: Origin; label: string }> = [
  { value: 'HUNT', label: 'Chasse' },
  { value: 'CSV', label: 'Import CSV' },
  { value: 'MANUAL', label: 'Manuel' },
  { value: 'ARDOISE', label: 'Ardoise' },
  { value: 'COURRIER', label: 'Courrier' },
  { value: 'AGENT', label: 'Agent' },
];

export const SUGGESTION_KINDS: Record<string, string> = {
  DRAFT: 'Brouillon',
  FOLLOW_UP: 'Relance',
  RESCORE: 'Nouveau score',
  NEXT_ACTION: 'Prochaine action',
  MATCH: 'Rapprochement',
  IMPORT: 'Import',
};

export function stageOf(value: string) {
  return STAGES.find((s) => s.value === value) ?? STAGES[0]!;
}

export function temperatureOf(value: string | null | undefined) {
  return TEMPERATURES.find((t) => t.value === value) ?? null;
}

export function originLabel(value: string): string {
  return ORIGINS.find((o) => o.value === value)?.label ?? value;
}

export function personName(p: { firstName?: string | null; lastName?: string | null; email?: string | null }): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || 'Sans nom';
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const BULLE_URL = 'https://bulle.facile.studio';

/** Bulle has no prefill parameter yet, so the prompt goes to the clipboard and Bulle opens in a new tab. */
export async function askBulle(prompt: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(prompt);
    toast.success('Question copiée : collez-la dans Bulle');
  } catch {
    toast.info('Ouvrez Bulle et décrivez ce contact');
  }
  window.open(BULLE_URL, '_blank', 'noopener');
}
