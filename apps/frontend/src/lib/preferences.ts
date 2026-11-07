import { LOCALE_COOKIE, type Locale, type Theme } from '@facile/muse';

export const THEME_KEY = 'glouton.theme';

export function persistLocale(locale: Locale): void {
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    return;
  }
}

export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    return;
  }
}
