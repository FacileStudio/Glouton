import { createTranslator, getI18n, type Catalogs, type Locale } from '@facile/muse';
import { rows, type Key } from './rows';

type Row = readonly [en: string, fr: string, es: string, de: string];

const catalogs = {
  en: {} as Record<Key, string>,
  fr: {} as Record<Key, string>,
  es: {} as Record<Key, string>,
  de: {} as Record<Key, string>,
};

for (const key of Object.keys(rows) as Key[]) {
  const [en, fr, es, de]: Row = rows[key];
  catalogs.en[key] = en;
  catalogs.fr[key] = fr;
  catalogs.es[key] = es;
  catalogs.de[key] = de;
}

const typed: Catalogs<Record<Key, string>> = catalogs;

export function useT() {
  const i18n = getI18n();
  return createTranslator(typed, () => i18n.locale);
}

export function useLocale(): () => Locale {
  const i18n = getI18n();
  return () => i18n.locale;
}

export function formatDate(value: Date | string | number, locale: Locale, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  return new Intl.DateTimeFormat(locale, options).format(new Date(value));
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}
