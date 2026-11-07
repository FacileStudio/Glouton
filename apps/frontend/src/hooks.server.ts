import type { Handle } from '@sveltejs/kit';
import { LOCALE_COOKIE, resolveLocale } from '@facile/muse';

export const handle: Handle = ({ event, resolve }) => {
  const locale = resolveLocale(event.cookies.get(LOCALE_COOKIE) ?? event.request.headers.get('accept-language'));
  event.locals.locale = locale;
  return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', locale) });
};
