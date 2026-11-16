import type { RouterOutputs } from '@repo/trpc-client';
import type { Key } from '$lib/i18n/rows';

export type FitItem = RouterOutputs['leadScore']['list']['items'][number];
export type FitReason = FitItem['reasons'][number];

type Translate = (key: Key, params?: Record<string, string | number>) => string;

export type FitTone = 'success' | 'warning' | 'neutral';

/** The pill colour of a score: 70 and up is a strong fit, 40 and up a possible one. */
export function fitTone(score: number): FitTone {
  return score >= 70 ? 'success' : score >= 40 ? 'warning' : 'neutral';
}

function listed(t: Translate, prefix: string, detail: string | null): string {
  return (detail ?? '')
    .split(',')
    .filter(Boolean)
    .map((code) => t(`${prefix}.${code}` as Key))
    .join(', ');
}

/** The sentence for one reason. Every code has its own localized line; the detail only fills a slot. */
export function reasonText(t: Translate, reason: FitReason): string {
  const key = `fit.${reason.factor}.${reason.code}` as Key;
  if (reason.code === 'audit_gaps') return t(key, { detail: listed(t, 'fit.gap', reason.detail) });
  if (reason.code === 'reachable') return t(key, { detail: listed(t, 'fit.way', reason.detail) });
  return t(key, { detail: reason.detail ?? '' });
}

/** One line per reason with its points, for a tooltip. */
export function reasonsSummary(t: Translate, reasons: FitReason[]): string {
  return reasons.map((reason) => `${reasonText(t, reason)} (${t('fit.points', { points: reason.points, max: reason.max })})`).join(' · ');
}

/** The strongest reasons first, for a compact card. */
export function topReasons(reasons: FitReason[], count: number): FitReason[] {
  return [...reasons].sort((a, b) => b.points / b.max - a.points / a.max || b.points - a.points).slice(0, count);
}
