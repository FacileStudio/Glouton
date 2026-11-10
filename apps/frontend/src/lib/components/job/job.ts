import type { BadgeProps } from '@facile/muse';
import type { RouterOutputs } from '@repo/trpc-client';

export type Offer = RouterOutputs['job']['offers'][number];
export type Search = RouterOutputs['job']['searches'][number];
export type Application = RouterOutputs['job']['application'];
export type Cv = RouterOutputs['job']['cvs'][number];
export type Draft = RouterOutputs['job']['drafts'][number];
export type ApplicationStatus = Application['status'];

/** The pipeline in display order. */
export const STATUSES: readonly ApplicationStatus[] = ['TO_APPLY', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED'];

export const STATUS_TONE: Record<ApplicationStatus, NonNullable<BadgeProps['tone']>> = {
  TO_APPLY: 'neutral',
  APPLIED: 'info',
  INTERVIEW: 'warning',
  OFFER: 'success',
  REJECTED: 'danger',
};

export const STATUS_ICON: Record<ApplicationStatus, string> = {
  TO_APPLY: 'solar:bookmark-linear',
  APPLIED: 'solar:plain-linear',
  INTERVIEW: 'solar:chat-round-dots-linear',
  OFFER: 'solar:cup-star-linear',
  REJECTED: 'solar:close-circle-linear',
};

export const FREQUENCIES = ['', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/** A stored timestamp as the date picker's ISO day, or empty. */
export function isoDay(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/** An ISO day from the date picker as a time of that day in UTC (noon unless given), so no time zone moves it to another day; null when empty. */
export function fromDay(day: string, hour = 12): Date | null {
  return day ? new Date(`${day}T${String(hour).padStart(2, '0')}:00:00.000Z`) : null;
}

/** A file as base64, without the data URL prefix. */
export function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

/** Saves base64 bytes as a file download. */
export function saveFile(data: string, mimeType: string, fileName: string): void {
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** A short salary line: the source's own text, else the range. */
export function salaryOf(offer: Pick<Offer, 'salaryText' | 'salaryMin' | 'salaryMax' | 'currency'>, format: (value: number) => string): string | null {
  if (offer.salaryText) return offer.salaryText;
  if (!offer.salaryMin && !offer.salaryMax) return null;
  const range = [offer.salaryMin, offer.salaryMax].filter((value): value is number => Boolean(value)).map(format).join(' – ');
  return offer.currency ? `${range} ${offer.currency}` : range;
}

/** The size of a file in KB or MB. */
export function sizeOf(bytes: number | null): string {
  if (!bytes) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
