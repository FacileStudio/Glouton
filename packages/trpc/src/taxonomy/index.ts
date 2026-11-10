import nafData from './naf.json';
import osmData from './osm.json';

/** A UI language. Spanish and German show the English labels. */
export type TaxonomyLocale = 'en' | 'fr' | 'es' | 'de';

/** One searchable item: a NAF subclass (`62.01Z`) or an OpenStreetMap tag (`craft=plumber`). */
export interface TaxonomyItem {
  kind: 'naf' | 'osm';
  value: string;
  label: string;
}

/** The old fixed hunt categories, kept so saved hunts, schedules and profiles still read. */
export const LEGACY_CATEGORIES = [
  'restaurant',
  'cafe',
  'bar',
  'hotel',
  'retail',
  'office',
  'service',
  'healthcare',
  'education',
  'entertainment',
  'automotive',
  'real-estate',
  'finance',
  'beauty',
  'fitness',
  'travel',
  'food-delivery',
  'grocery',
  'pharmacy',
  'pet-services',
  'home-services',
  'professional-services',
  'seo-agency',
  'design-agency',
  'web-dev-agency',
  'marketing-agency',
  'other',
] as const;

export type LegacyCategory = (typeof LEGACY_CATEGORIES)[number];

/** The OpenStreetMap tags each old category stands for. `other` stands for nothing. */
export const LEGACY_CATEGORY_TAGS: Record<LegacyCategory, string[]> = {
  restaurant: ['amenity=restaurant'],
  cafe: ['amenity=cafe'],
  bar: ['amenity=bar', 'amenity=pub', 'amenity=nightclub'],
  hotel: ['tourism=hotel', 'tourism=motel', 'tourism=guest_house'],
  retail: ['shop=*'],
  office: ['office=*'],
  service: ['craft=*'],
  healthcare: ['amenity=hospital', 'amenity=clinic', 'amenity=doctors', 'amenity=dentist', 'amenity=pharmacy'],
  education: ['amenity=school', 'amenity=university', 'amenity=college'],
  entertainment: ['amenity=cinema', 'amenity=theatre', 'tourism=museum', 'tourism=gallery'],
  automotive: ['shop=car', 'shop=car_repair', 'amenity=car_wash', 'amenity=fuel'],
  'real-estate': ['office=estate_agent'],
  finance: ['amenity=bank'],
  beauty: ['shop=hairdresser', 'shop=beauty'],
  fitness: ['leisure=fitness_centre', 'leisure=sports_centre'],
  travel: ['shop=travel_agency'],
  'food-delivery': ['amenity=fast_food'],
  grocery: ['shop=supermarket', 'shop=convenience'],
  pharmacy: ['amenity=pharmacy'],
  'pet-services': ['amenity=veterinary', 'shop=pet'],
  'home-services': ['craft=plumber', 'craft=electrician', 'craft=carpenter', 'craft=painter', 'craft=hvac'],
  'professional-services': ['office=lawyer', 'office=accountant', 'office=consulting'],
  'seo-agency': ['office=advertising_agency'],
  'design-agency': ['office=graphic_design'],
  'web-dev-agency': ['office=it'],
  'marketing-agency': ['office=advertising_agency'],
  other: [],
};

type Entry = { value: string; en: string; fr: string; search: string };

/** Lower-cases and strips accents, so "electricien" finds "Électricien". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function entries(rows: string[][]): Map<string, Entry> {
  return new Map(
    rows.map(([value, en, fr]) => [value, { value, en, fr, search: fold(`${value} ${value.replace('.', '')} ${en} ${fr}`) }])
  );
}

const NAF = entries(nafData.items);
const OSM = entries(osmData.items);

const NAF_SHAPE = /^(\d{2})\.?(\d{2})([A-Za-z])$/;

/** `6201z`, `62.01z` and `62.01Z` all give `62.01Z`; anything that is not a known subclass gives null. */
export function normalizeNaf(input: string): string | null {
  const match = NAF_SHAPE.exec(input.trim());
  if (!match) return null;
  const code = `${match[1]}.${match[2]}${match[3]!.toUpperCase()}`;
  return NAF.has(code) ? code : null;
}

/** True for a tag of the curated OpenStreetMap list, `office=*` included. */
export function isOsmTag(value: string): boolean {
  return OSM.has(value);
}

/** True for an old category or a curated OpenStreetMap tag: what a hunt may search for. */
export function isHuntCategory(value: string): boolean {
  return isOsmTag(value) || (LEGACY_CATEGORIES as readonly string[]).includes(value);
}

/** The OpenStreetMap tags an old category maps to; a tag maps to itself; anything else to nothing. */
export function tagsForCategory(value: string): string[] {
  if (isOsmTag(value)) return [value];
  return (LEGACY_CATEGORY_TAGS as Record<string, string[]>)[value] ?? [];
}

function pick(entry: Entry, locale: TaxonomyLocale): string {
  return locale === 'fr' ? entry.fr : entry.en;
}

/** The label of a NAF code or an OpenStreetMap tag in a UI language, or null when unknown. */
export function taxonomyLabel(value: string, locale: TaxonomyLocale): string | null {
  const naf = NAF.get(value);
  if (naf) return pick(naf, locale);
  const osm = OSM.get(value);
  return osm ? pick(osm, locale) : null;
}

function rank(entry: Entry, needle: string, words: string[]): number {
  if (fold(entry.value).startsWith(needle) || fold(entry.value.replace('.', '')).startsWith(needle)) return 0;
  if (fold(entry.fr).startsWith(needle) || fold(entry.en).startsWith(needle)) return 1;
  if (words.every((word) => entry.search.includes(` ${word}`) || entry.search.startsWith(word))) return 2;
  if (words.every((word) => entry.search.includes(word))) return 3;
  return -1;
}

/**
 * Searches both lists by code, tag, French and English label, ignoring case
 * and accents. Codes and label starts rank first; every word of the query
 * must appear. Labels come back in the UI language.
 */
export function searchTaxonomy(
  query: string,
  locale: TaxonomyLocale,
  options: { kinds?: Array<'naf' | 'osm'>; limit?: number } = {}
): TaxonomyItem[] {
  const needle = fold(query);
  if (!needle) return [];
  const words = needle.split(/\s+/).filter(Boolean);
  const kinds = options.kinds ?? ['naf', 'osm'];
  const found: Array<{ item: TaxonomyItem; score: number }> = [];
  for (const kind of kinds) {
    for (const entry of Array.from((kind === 'naf' ? NAF : OSM).values())) {
      const score = rank(entry, needle, words);
      if (score >= 0) found.push({ item: { kind, value: entry.value, label: pick(entry, locale) }, score });
    }
  }
  found.sort((a, b) => a.score - b.score || a.item.label.length - b.item.label.length);
  return found.slice(0, options.limit ?? 30).map((entry) => entry.item);
}

/** Where the vendored lists come from, for the about text. */
export const TAXONOMY_SOURCES = { naf: nafData.source, osm: osmData.source };
