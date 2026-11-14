import type { Handle } from '@sveltejs/kit';
import { LOCALE_COOKIE, resolveLocale, type Locale } from '@facile/muse';
import { landing } from '$lib/i18n/rows/landing';

const ORDER: readonly Locale[] = ['en', 'fr', 'es', 'de'];

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function localize(html: string, locale: Locale): string {
  const at = ORDER.indexOf(locale);
  return html
    .replace('%lang%', locale)
    .replaceAll('%glouton.title%', escape(landing['landing.metaTitle'][at]))
    .replaceAll('%glouton.description%', escape(landing['landing.metaDescription'][at]));
}

export const handle: Handle = ({ event, resolve }) => {
  const locale = resolveLocale(event.cookies.get(LOCALE_COOKIE) ?? event.request.headers.get('accept-language'));
  event.locals.locale = locale;
  return resolve(event, { transformPageChunk: ({ html }) => localize(html, locale) });
};
