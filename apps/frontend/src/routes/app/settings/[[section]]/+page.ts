import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

const SECTIONS = ['profile', 'preferences', 'mail', 'subscription', 'advanced'];
const LEGACY: Record<string, string> = { appearance: 'preferences', account: 'mail' };

export const load: PageLoad = ({ params }) => {
  const section = params.section;
  if (!section) return { section: undefined };
  const legacy = LEGACY[section];
  if (legacy) redirect(308, `/app/settings/${legacy}`);
  if (!SECTIONS.includes(section)) redirect(307, '/app/settings');
  return { section };
};
