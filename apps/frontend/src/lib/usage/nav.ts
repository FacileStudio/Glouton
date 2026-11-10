import type { Key } from '$lib/i18n/rows';

/** What a space uses Glouton for. */
export type Usage = 'clients' | 'competitors' | 'missions' | 'partners' | 'job';

/** The usages, in wizard order. */
export const USAGE_ORDER: readonly Usage[] = ['clients', 'competitors', 'missions', 'partners', 'job'];

export const USAGE_ICONS: Record<Usage, string> = {
  clients: 'solar:magnet-linear',
  competitors: 'solar:ranking-linear',
  missions: 'solar:case-round-linear',
  partners: 'solar:hand-shake-linear',
  job: 'solar:user-id-linear',
};

export interface NavTab {
  id: string;
  label: Key;
  icon: string;
  href: string;
  usages: readonly Usage[];
}

export interface NavSection {
  id: 'ideas' | 'prospects' | 'searches' | 'competitors' | 'job' | 'messages';
  label: Key;
  icon: string;
  href: string;
  tabs: readonly NavTab[];
  /** False keeps the slot reserved without showing it. */
  available: boolean;
  /** Shown for every usage: Ideas, which has no tabs. */
  always?: boolean;
}

const PROSPECTING: readonly Usage[] = ['clients', 'missions', 'partners'];

/**
 * The sidebar, top to bottom. Ideas comes first in every space, as in every
 * suite app. Any other section shows when one of its tabs belongs to an
 * active usage.
 */
export const NAV: readonly NavSection[] = [
  { id: 'ideas', label: 'nav.ideas', icon: 'solar:lightbulb-linear', href: '/app/ideas', tabs: [], available: true, always: true },
  {
    id: 'prospects',
    label: 'nav.prospects',
    icon: 'solar:magnet-linear',
    href: '/app/prospects',
    available: true,
    tabs: [
      { id: 'leads', label: 'nav.tab.leads', icon: 'solar:magnet-linear', href: '/app/prospects/leads', usages: ['clients', 'partners'] },
      { id: 'contacts', label: 'nav.tab.contacts', icon: 'solar:users-group-two-rounded-linear', href: '/app/prospects/contacts', usages: PROSPECTING },
      { id: 'creations', label: 'nav.tab.creations', icon: 'solar:buildings-2-linear', href: '/app/prospects/creations', usages: ['clients', 'partners'] },
      { id: 'missions', label: 'nav.tab.missions', icon: 'solar:case-round-linear', href: '/app/prospects/missions', usages: ['missions'] },
    ],
  },
  {
    id: 'searches',
    label: 'nav.searches',
    icon: 'solar:radar-2-linear',
    href: '/app/searches',
    available: true,
    tabs: [
      { id: 'hunts', label: 'nav.tab.hunts', icon: 'solar:radar-2-linear', href: '/app/searches/hunts', usages: ['clients', 'partners'] },
      { id: 'schedules', label: 'nav.tab.schedules', icon: 'solar:refresh-circle-linear', href: '/app/searches/schedules', usages: ['clients', 'partners'] },
    ],
  },
  {
    id: 'competitors',
    label: 'nav.competitors',
    icon: 'solar:ranking-linear',
    href: '/app/competitors',
    available: true,
    tabs: [
      { id: 'list', label: 'discovery.tab.list', icon: 'solar:ranking-linear', href: '/app/competitors', usages: ['competitors'] },
      { id: 'suggestions', label: 'discovery.tab.suggestions', icon: 'solar:magnifer-linear', href: '/app/competitors/suggestions', usages: ['competitors'] },
      { id: 'monitoring', label: 'nav.tab.monitoring', icon: 'solar:eye-linear', href: '/app/competitors/monitoring', usages: ['competitors'] },
    ],
  },
  {
    id: 'job',
    label: 'nav.job',
    icon: 'solar:user-id-linear',
    href: '/app/job',
    available: true,
    tabs: [
      { id: 'offers', label: 'nav.tab.jobOffers', icon: 'solar:magnifer-linear', href: '/app/job/offers', usages: ['job'] },
      { id: 'applications', label: 'nav.tab.applications', icon: 'solar:checklist-minimalistic-linear', href: '/app/job/applications', usages: ['job'] },
      { id: 'cv', label: 'nav.tab.cv', icon: 'solar:document-text-linear', href: '/app/job/cv', usages: ['job'] },
    ],
  },
  {
    id: 'messages',
    label: 'nav.messages',
    icon: 'solar:letter-linear',
    href: '/app/messages',
    available: true,
    tabs: [
      { id: 'inbox', label: 'nav.tab.inbox', icon: 'solar:inbox-linear', href: '/app/messages/inbox', usages: PROSPECTING },
      { id: 'outreach', label: 'nav.tab.outreach', icon: 'solar:letter-linear', href: '/app/messages/outreach', usages: PROSPECTING },
    ],
  },
];

/** The sections and tabs a set of usages shows. An empty set shows everything, as before usages existed. */
export function navFor(usages: readonly Usage[]): NavSection[] {
  const all = usages.length === 0;
  return NAV.flatMap((section) => {
    if (!section.available) return [];
    if (section.always) return [section];
    const tabs = section.tabs.filter((tab) => all || tab.usages.some((usage) => usages.includes(usage)));
    return tabs.length > 0 ? [{ ...section, href: tabs[0]!.href, tabs }] : [];
  });
}

/** Where the app opens: the first visible tab, or the settings when no usage opens anything. Ideas is never home. */
export function homeFor(usages: readonly Usage[]): string {
  return navFor(usages).find((section) => !section.always)?.href ?? '/app/settings/prospecting';
}

/** True when the path belongs to the section: its own prefix or any of its tabs. */
export function inSection(section: NavSection, path: string): boolean {
  const under = (href: string) => path === href || path.startsWith(`${href}/`);
  return under(section.href) || section.tabs.some((tab) => under(tab.href)) || (LEGACY_PREFIXES[section.id] ?? []).some(under);
}

/** Detail pages that kept their old address, so the right section still lights up. */
const LEGACY_PREFIXES: Partial<Record<NavSection['id'], string[]>> = {
  prospects: ['/app/leads', '/app/contacts', '/app/missions'],
  searches: ['/app/hunts'],
};

/** Old list addresses and where they live now. Detail pages keep their address. */
export const REDIRECTS: Readonly<Record<string, string>> = {
  '/app/leads': '/app/prospects/leads',
  '/app/contacts': '/app/prospects/contacts',
  '/app/creations': '/app/prospects/creations',
  '/app/missions': '/app/prospects/missions',
  '/app/hunts': '/app/searches/hunts',
  '/app/hunts/schedules': '/app/searches/schedules',
  '/app/inbox': '/app/messages/inbox',
  '/app/outreach': '/app/messages/outreach',
};

/** The new address of an old one, query string kept, or null when the path did not move. */
export function redirectFor(path: string, search: string): string | null {
  const target = REDIRECTS[path.replace(/\/$/, '')];
  return target ? `${target}${search}` : null;
}
