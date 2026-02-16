import type { BusinessCategory } from '../types';

export const GOOGLE_MAPS_CATEGORIES: Record<BusinessCategory, string[]> = {
  restaurant: ['restaurant', 'food'],
  cafe: ['cafe', 'coffee shop'],
  bar: ['bar', 'pub', 'nightclub'],
  hotel: ['hotel', 'motel', 'lodging'],
  retail: ['store', 'shop', 'retail'],
  office: ['office', 'corporate office'],
  service: ['service', 'services'],
  healthcare: ['hospital', 'clinic', 'doctor', 'dentist', 'medical'],
  education: ['school', 'university', 'college', 'academy', 'education'],
  entertainment: ['cinema', 'theater', 'museum', 'gallery', 'amusement'],
  automotive: ['car dealer', 'auto repair', 'car wash', 'gas station'],
  'real-estate': ['real estate', 'property'],
  finance: ['bank', 'atm', 'financial', 'insurance'],
  beauty: ['salon', 'spa', 'barber', 'beauty'],
  fitness: ['gym', 'fitness', 'yoga', 'sports'],
  travel: ['travel agency', 'tour operator'],
  'food-delivery': ['food delivery'],
  grocery: ['grocery', 'supermarket', 'convenience store'],
  pharmacy: ['pharmacy', 'drugstore'],
  'pet-services': ['veterinarian', 'pet store', 'pet grooming'],
  'home-services': ['plumber', 'electrician', 'carpenter', 'cleaning'],
  'professional-services': ['lawyer', 'accountant', 'consultant'],
  other: ['business'],
};

export const OVERPASS_CATEGORIES: Record<BusinessCategory, string[]> = {
  restaurant: ['amenity=restaurant'],
  cafe: ['amenity=cafe'],
  bar: ['amenity=bar', 'amenity=pub', 'amenity=nightclub'],
  hotel: ['tourism=hotel', 'tourism=motel', 'tourism=guest_house'],
  retail: ['shop=*'],
  office: ['office=*'],
  service: ['craft=*'],
  healthcare: [
    'amenity=hospital',
    'amenity=clinic',
    'amenity=doctors',
    'amenity=dentist',
    'amenity=pharmacy',
  ],
  education: ['amenity=school', 'amenity=university', 'amenity=college'],
  entertainment: ['amenity=cinema', 'amenity=theatre', 'tourism=museum', 'tourism=gallery'],
  automotive: ['shop=car', 'shop=car_repair', 'amenity=car_wash', 'amenity=fuel'],
  'real-estate': ['office=estate_agent'],
  finance: ['amenity=bank', 'amenity=atm'],
  beauty: ['shop=hairdresser', 'shop=beauty', 'shop=barber'],
  fitness: ['leisure=fitness_centre', 'leisure=sports_centre'],
  travel: ['shop=travel_agency'],
  'food-delivery': [],
  grocery: ['shop=supermarket', 'shop=convenience'],
  pharmacy: ['amenity=pharmacy'],
  'pet-services': ['amenity=veterinary', 'shop=pet'],
  'home-services': [],
  'professional-services': ['office=lawyer', 'office=accountant', 'office=consulting'],
  other: ['*=*'],
};

export function getGoogleMapsSearchQuery(category: BusinessCategory): string {
  const queries = GOOGLE_MAPS_CATEGORIES[category];
  return queries[0] || 'business';
}

export function getOverpassQuery(
  category: BusinessCategory,
  bbox: { south: number; west: number; north: number; east: number }
): string {
  const tags = OVERPASS_CATEGORIES[category];

  if (tags.length === 0) {
    return '';
  }

  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  const formatTag = (tag: string): string => {
    if (tag === '*=*') {
      return '';
    }
    if (tag.endsWith('=*')) {
      const key = tag.slice(0, -2);
      return `["${key}"]`;
    }
    const [key, value] = tag.split('=');
    return `["${key}"="${value}"]`;
  };

  const nodeQueries = tags.map((tag) => `node${formatTag(tag)}(${bboxStr});`).join('\n  ');
  const wayQueries = tags.map((tag) => `way${formatTag(tag)}(${bboxStr});`).join('\n  ');

  return `[out:json][timeout:25];
(
  ${nodeQueries}
  ${wayQueries}
);
out body;
>;
out skel qt;`;
}

export function categoryToOverpassTags(category: BusinessCategory): string[] {
  return OVERPASS_CATEGORIES[category];
}

export function normalizeCategory(category: string): BusinessCategory {
  const normalized = category.toLowerCase().trim();

  const categoryMap: Record<string, BusinessCategory> = {
    restaurant: 'restaurant',
    cafe: 'cafe',
    'coffee shop': 'cafe',
    bar: 'bar',
    pub: 'bar',
    hotel: 'hotel',
    motel: 'hotel',
    store: 'retail',
    shop: 'retail',
    office: 'office',
    hospital: 'healthcare',
    clinic: 'healthcare',
    school: 'education',
    university: 'education',
    bank: 'finance',
    gym: 'fitness',
    salon: 'beauty',
  };

  return categoryMap[normalized] || 'other';
}
