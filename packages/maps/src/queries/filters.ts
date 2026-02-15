import type { LocalBusiness } from '../types';

/**
 * filterByWebsite
 */
export function filterByWebsite(
  businesses: LocalBusiness[],
  hasWebsite?: boolean
): LocalBusiness[] {
  /**
   * if
   */
  if (hasWebsite === undefined) {
    return businesses;
  }

  return businesses.filter((business) => business.hasWebsite === hasWebsite);
}

const CATEGORY_TO_OSM_PREFIX: Record<string, string[]> = {
  'retail': ['shop:'],
  'service': ['craft:'],
  'restaurant': ['amenity:restaurant'],
  'cafe': ['amenity:cafe'],
  'bar': ['amenity:bar', 'amenity:pub', 'amenity:nightclub'],
  'hotel': ['tourism:hotel', 'tourism:motel', 'tourism:guest_house'],
  'office': ['office:'],
  'healthcare': ['amenity:hospital', 'amenity:clinic', 'amenity:doctors', 'amenity:dentist', 'amenity:pharmacy'],
  'education': ['amenity:school', 'amenity:university', 'amenity:college'],
  'entertainment': ['amenity:cinema', 'amenity:theatre', 'tourism:museum', 'tourism:gallery'],
  'automotive': ['shop:car', 'shop:car_repair', 'amenity:car_wash', 'amenity:fuel'],
  'real-estate': ['office:estate_agent'],
  'finance': ['amenity:bank', 'amenity:atm'],
  'beauty': ['shop:hairdresser', 'shop:beauty', 'shop:barber'],
  'fitness': ['leisure:fitness_centre', 'leisure:sports_centre'],
  'travel': ['shop:travel_agency'],
  'grocery': ['shop:supermarket', 'shop:convenience'],
  'pharmacy': ['amenity:pharmacy'],
  'pet-services': ['amenity:veterinary', 'shop:pet'],
  'professional-services': ['office:lawyer', 'office:accountant', 'office:consulting'],
};

/**
 * filterByCategory
 */
export function filterByCategory(
  businesses: LocalBusiness[],
  category?: string
): LocalBusiness[] {
  /**
   * if
   */
  if (!category) {
    return businesses;
  }

  const normalizedCategory = category.toLowerCase().trim();

  return businesses.filter((business) => {
    /**
     * if
     */
    if (!business.category) return false;

    const businessCategory = business.category.toLowerCase();

    const osmPrefixes = CATEGORY_TO_OSM_PREFIX[normalizedCategory];
    /**
     * if
     */
    if (osmPrefixes) {
      return osmPrefixes.some(prefix => {
        /**
         * if
         */
        if (prefix.endsWith(':')) {
          return businessCategory.startsWith(prefix);
        } else {
          return businessCategory === prefix || businessCategory.includes(normalizedCategory);
        }
      });
    }

    return businessCategory.includes(normalizedCategory);
  });
}

/**
 * filterByLocation
 */
export function filterByLocation(
  businesses: LocalBusiness[],
  bbox?: { south: number; west: number; north: number; east: number }
): LocalBusiness[] {
  /**
   * if
   */
  if (!bbox) {
    return businesses;
  }

  return businesses.filter((business) => {
    /**
     * if
     */
    if (!business.coordinates) return false;

    const { lat, lng } = business.coordinates;
    return lat >= bbox.south && lat <= bbox.north && lng >= bbox.west && lng <= bbox.east;
  });
}

/**
 * limitResults
 */
export function limitResults(businesses: LocalBusiness[], limit?: number): LocalBusiness[] {
  /**
   * if
   */
  if (!limit) {
    return businesses;
  }

  return businesses.slice(0, limit);
}

/**
 * applyFilters
 */
export function applyFilters(
  businesses: LocalBusiness[],
  filters: {
    hasWebsite?: boolean;
    category?: string;
    bbox?: { south: number; west: number; north: number; east: number };
    limit?: number;
  }
): LocalBusiness[] {
  let filtered = businesses;

  filtered = filterByWebsite(filtered, filters.hasWebsite);
  filtered = filterByCategory(filtered, filters.category);
  filtered = filterByLocation(filtered, filters.bbox);
  filtered = limitResults(filtered, filters.limit);

  return filtered;
}
