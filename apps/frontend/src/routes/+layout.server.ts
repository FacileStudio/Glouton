import { LOCALE_COOKIE } from '@facile/muse';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, cookies }) => ({
  locale: locals.locale,
  chosen: cookies.get(LOCALE_COOKIE) !== undefined,
});
