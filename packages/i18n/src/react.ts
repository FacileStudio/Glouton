import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Locale, Translations, InterpolationParams } from './types';
import { createTranslator } from './utils/translator';
import { en } from './locales/en';
import { fr } from './locales/fr';
import { defaultLocale, supportedLocales } from './index';

const translationsMap: Record<Locale, Translations> = {
  en,
  fr,
};

let currentLocale: Locale = defaultLocale;
let listeners: Set<(locale: Locale) => void> = new Set();

/**
 * getStoredLocale
 */
function getStoredLocale(): Locale | null {
  try {
    /**
     * if
     */
    if (typeof localStorage !== 'undefined') {
      /**
       * return
       */
      return (localStorage.getItem('locale') as Locale) || null;
    }
  } catch {}
  return null;
}

/**
 * setStoredLocale
 */
function setStoredLocale(locale: Locale) {
  try {
    /**
     * if
     */
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('locale', locale);
    }
  } catch {}
}

/**
 * notifyListeners
 */
function notifyListeners() {
  listeners.forEach((listener) => listener(currentLocale));
}

/**
 * setLocale
 */
export function setLocale(locale: Locale) {
  /**
   * if
   */
  if (supportedLocales.includes(locale)) {
    currentLocale = locale;
    /**
     * setStoredLocale
     */
    setStoredLocale(locale);
    /**
     * notifyListeners
     */
    notifyListeners();
  }
}

/**
 * getLocale
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * useI18n
 */
export function useI18n() {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = getStoredLocale();
    /**
     * if
     */
    if (stored && supportedLocales.includes(stored)) {
      currentLocale = stored;
      return stored;
    }
    return currentLocale;
  });

  /**
   * useEffect
   */
  useEffect(() => {
    /**
     * listener
     */
    const listener = (newLocale: Locale) => {
      /**
       * setLocaleState
       */
      setLocaleState(newLocale);
    };

    listeners.add(listener);

    /**
     * return
     */
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const translations = useMemo(() => translationsMap[locale], [locale]);

  const t = useMemo(
    () => createTranslator(translations),
    [translations]
  );

  const changeLocale = useCallback((newLocale: Locale) => {
    /**
     * setLocale
     */
    setLocale(newLocale);
  }, []);

  return {
    locale,
    t,
    setLocale: changeLocale,
    supportedLocales: supportedLocales as readonly Locale[],
  };
}

/**
 * useTranslation
 */
export function useTranslation() {
  const { t, locale } = useI18n();
  return { t, locale };
}

/**
 * Trans
 */
export function Trans({
  k,
  params,
}: {
  k: string;
  params?: InterpolationParams;
}) {
  const { t } = useTranslation();
  return t(k, params);
}
