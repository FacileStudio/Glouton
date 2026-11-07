import { createTranslator, getI18n, type Catalogs, type Locale } from '@facile/muse';
import { rows, type Key } from './rows';
import type { Msg, Row } from './rows/types';

const catalogs = {
  en: {} as Record<Key, Msg>,
  fr: {} as Record<Key, Msg>,
  es: {} as Record<Key, Msg>,
  de: {} as Record<Key, Msg>,
};

for (const key of Object.keys(rows) as Key[]) {
  const [en, fr, es, de]: Row = rows[key];
  catalogs.en[key] = en;
  catalogs.fr[key] = fr;
  catalogs.es[key] = es;
  catalogs.de[key] = de;
}

const typed: Catalogs<Record<Key, Msg>> = catalogs;

export function useT() {
  const i18n = getI18n();
  return createTranslator(typed, () => i18n.locale);
}

export function useLocale(): () => Locale {
  const i18n = getI18n();
  return () => i18n.locale;
}

type Moment = Date | string | number | null | undefined;

export function formatDate(value: Moment, locale: Locale, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  if (value === null || value === undefined || value === '') return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

const CLOCK = [
  ['hour', 3_600_000],
  ['minute', 60_000],
  ['second', 1_000],
] as const;

export function formatDuration(ms: number, locale: Locale, maxParts = 2): string {
  let rest = Math.max(0, Math.floor(ms / 1000)) * 1000;
  const parts: string[] = [];
  for (const [unit, size] of CLOCK) {
    const amount = Math.floor(rest / size);
    rest -= amount * size;
    if (amount > 0 && parts.length < maxParts) {
      parts.push(new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow' }).format(amount));
    }
  }
  return parts.length > 0 ? parts.join(' ') : new Intl.NumberFormat(locale, { style: 'unit', unit: 'second', unitDisplay: 'narrow' }).format(0);
}

export function formatAgo(value: Moment, locale: Locale, now: number = Date.now()): string {
  if (value === null || value === undefined || value === '') return '';
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  if (Number.isNaN(seconds)) return '';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  const abs = Math.abs(seconds);
  if (abs < 120) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}

export function useFormat() {
  const locale = useLocale();
  return {
    date: (value: Moment, options?: Intl.DateTimeFormatOptions) => formatDate(value, locale(), options),
    dateTime: (value: Moment) => formatDate(value, locale(), { dateStyle: 'short', timeStyle: 'short' }),
    time: (value: Moment) => formatDate(value, locale(), { timeStyle: 'medium' }),
    number: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(value, locale(), options),
    duration: (ms: number, maxParts?: number) => formatDuration(ms, locale(), maxParts),
    ago: (value: Moment) => formatAgo(value, locale()),
    days: (count: number) => new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(-count, 'day'),
  };
}
