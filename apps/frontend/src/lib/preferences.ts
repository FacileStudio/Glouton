import { LOCALE_COOKIE, type Locale } from '@facile/muse';
import { createTheme } from '@facile/client/theme';

/** The theme choice, persisted under the key the `app.html` pre-paint script reads. */
export const theme = createTheme('glouton.theme');

export function persistLocale(locale: Locale): void {
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    return;
  }
}

export const SPACES_URL = 'https://sso.facile.studio/spaces';
