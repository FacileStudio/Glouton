import { writable, derived, get } from 'svelte/store';
import type { Locale, Translations, InterpolationParams } from './types';
import { createTranslator, detectBrowserLocale } from './utils/translator';
import { en } from './locales/en';
import { fr } from './locales/fr';
import { defaultLocale, supportedLocales } from './index';

const translationsMap: Record<Locale, Translations> = {
  en,
  fr,
};

/**
 * getStoredLocale
 */
function getStoredLocale(): Locale | null {
  /**
   * if
   */
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  try {
    /**
     * return
     */
    return (localStorage.getItem('locale') as Locale) || null;
  } catch {
    return null;
  }
}

/**
 * saveLocale
 */
function saveLocale(locale: Locale) {
  /**
   * if
   */
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem('locale', locale);
  } catch {
  }
}

/**
 * createI18nStore
 */
function createI18nStore() {
  const storedLocale = getStoredLocale();

  const detectedLocale =
    typeof window !== 'undefined'
      ? (detectBrowserLocale(
          supportedLocales as unknown as string[],
          defaultLocale
        ) as Locale)
      : defaultLocale;

  const initialLocale = storedLocale || detectedLocale;

  const locale = writable<Locale>(initialLocale);

  const translations = derived(locale, ($locale) => translationsMap[$locale]);

  const t = derived(translations, ($translations) =>
    /**
     * createTranslator
     */
    createTranslator($translations)
  );

  /**
   * setLocale
   */
  function setLocale(newLocale: Locale) {
    /**
     * if
     */
    if (supportedLocales.includes(newLocale)) {
      locale.set(newLocale);
      /**
       * saveLocale
       */
      saveLocale(newLocale);
    }
  }

  /**
   * translate
   */
  function translate(key: string, params?: InterpolationParams): string {
    const translator = get(t);
    return translator(key, params);
  }

  return {
    locale,
    t,
    setLocale,
    translate,
  };
}

export const { locale, t, setLocale, translate } = createI18nStore();
