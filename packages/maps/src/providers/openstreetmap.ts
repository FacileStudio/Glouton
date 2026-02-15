import axios from 'axios';
import type { LocalBusiness, OverpassOptions, SearchOptions, BoundingBox } from '../types';
import { getOverpassQuery } from '../queries/categories';
import { cityToBoundingBox, coordinatesToBoundingBox } from '../utils/geocoding';

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

const DEFAULT_OPTIONS: OverpassOptions = {
  timeout: 25,
  maxResults: 100,
};

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: {
    name?: string;
    'addr:street'?: string;
    'addr:housenumber'?: string;
    'addr:city'?: string;
    'addr:state'?: string;
    'addr:country'?: string;
    'addr:postcode'?: string;
    phone?: string;
    'contact:phone'?: string;
    website?: string;
    'contact:website'?: string;
    opening_hours?: string;
    amenity?: string;
    shop?: string;
    office?: string;
    tourism?: string;
    leisure?: string;
    craft?: string;
    [key: string]: string | undefined;
  };
  center?: {
    lat: number;
    lon: number;
  };
}

interface OverpassResponse {
  version: number;
  generator: string;
  elements: OverpassElement[];
}

export class OpenStreetMapScraper {
  private options: OverpassOptions;

  /**
   * constructor
   */
  constructor(options: Partial<OverpassOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * search
   */
  async search(searchOptions: SearchOptions): Promise<LocalBusiness[]> {
    const bbox = await this.getBoundingBox(searchOptions);

    /**
     * if
     */
    if (!bbox) {
      throw new Error('Location must be provided for OpenStreetMap search');
    }

    /**
     * if
     */
    if (!searchOptions.category) {
      throw new Error('Category must be provided for OpenStreetMap search');
    }

    const query = getOverpassQuery(searchOptions.category, bbox);

    /**
     * if
     */
    if (!query) {
      return [];
    }

    try {
      const response = await axios.post<OverpassResponse>(
        OVERPASS_API_URL,
        query,
        {
          headers: {
            'Content-Type': 'text/plain',
          },
          timeout: (this.options.timeout || 25) * 1000,
        }
      );

      const businesses = this.parseResponse(response.data);

      /**
       * if
       */
      if (searchOptions.hasWebsite !== undefined) {
        return businesses.filter((b) => b.hasWebsite === searchOptions.hasWebsite);
      }

      /**
       * if
       */
      if (searchOptions.limit) {
        return businesses.slice(0, searchOptions.limit);
      }

      return businesses.slice(0, this.options.maxResults);
    } catch (error) {
      /**
       * if
       */
      if (axios.isAxiosError(error)) {
        throw new Error(`Overpass API error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * getBoundingBox
   */
  private async getBoundingBox(options: SearchOptions): Promise<BoundingBox | null> {
    /**
     * if
     */
    if (!options.location) {
      return null;
    }

    /**
     * if
     */
    if (typeof options.location === 'string') {
      return await cityToBoundingBox(options.location);
    }

    /**
     * if
     */
    if ('south' in options.location) {
      return options.location;
    }

    /**
     * if
     */
    if ('lat' in options.location) {
      return coordinatesToBoundingBox(options.location);
    }

    return null;
  }

  /**
   * parseResponse
   */
  private parseResponse(response: OverpassResponse): LocalBusiness[] {
    const businesses: LocalBusiness[] = [];

    /**
     * for
     */
    for (const element of response.elements) {
      /**
       * if
       */
      if (!element.tags?.name) {
        continue;
      }

      const business = this.parseElement(element);
      /**
       * if
       */
      if (business) {
        businesses.push(business);
      }
    }

    return businesses;
  }

  /**
   * parseElement
   */
  private parseElement(element: OverpassElement): LocalBusiness | null {
    const tags = element.tags;

    /**
     * if
     */
    if (!tags || !tags.name) {
      return null;
    }

    const phone = tags.phone || tags['contact:phone'];
    const website = tags.website || tags['contact:website'];

    const street = tags['addr:street'];
    const housenumber = tags['addr:housenumber'];
    let address: string | undefined;

    /**
     * if
     */
    if (street && housenumber) {
      address = `${housenumber} ${street}`;
    } else if (street) {
      address = street;
    }

    const category = this.extractCategory(tags);

    let coordinates: { lat: number; lng: number } | undefined;

    /**
     * if
     */
    if (element.lat !== undefined && element.lon !== undefined) {
      coordinates = { lat: element.lat, lng: element.lon };
    } else if (element.center) {
      coordinates = { lat: element.center.lat, lng: element.center.lon };
    }

    return {
      source: 'openstreetmap',
      name: tags.name,
      address,
      city: tags['addr:city'],
      state: tags['addr:state'],
      country: tags['addr:country'],
      postalCode: tags['addr:postcode'],
      phone,
      website,
      hasWebsite: Boolean(website),
      category,
      coordinates,
      openingHours: tags.opening_hours,
      metadata: {
        osmId: element.id,
        osmType: element.type,
        tags: Object.entries(tags)
          .filter(([key]) => !key.startsWith('addr:') && key !== 'name')
          .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}),
      },
    };
  }

  /**
   * extractCategory
   */
  private extractCategory(tags: Record<string, string | undefined>): string | undefined {
    const categoryKeys = ['amenity', 'shop', 'office', 'tourism', 'leisure', 'craft'];

    /**
     * for
     */
    for (const key of categoryKeys) {
      /**
       * if
       */
      if (tags[key]) {
        return `${key}:${tags[key]}`;
      }
    }

    return undefined;
  }

  /**
   * searchByTags
   */
  async searchByTags(
    tags: Record<string, string>,
    bbox: BoundingBox,
    options: Partial<OverpassOptions> = {}
  ): Promise<LocalBusiness[]> {
    const mergedOptions = { ...this.options, ...options };

    const tagQueries = Object.entries(tags)
      .map(([key, value]) => `["${key}"="${value}"]`)
      .join('');

    const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

    const query = `[out:json][timeout:${mergedOptions.timeout}];
(
  node${tagQueries}(${bboxStr});
  way${tagQueries}(${bboxStr});
);
out body;
>;
out skel qt;`;

    try {
      const response = await axios.post<OverpassResponse>(
        OVERPASS_API_URL,
        query,
        {
          headers: {
            'Content-Type': 'text/plain',
          },
          timeout: mergedOptions.timeout! * 1000,
        }
      );

      return this.parseResponse(response.data);
    } catch (error) {
      /**
       * if
       */
      if (axios.isAxiosError(error)) {
        throw new Error(`Overpass API error: ${error.message}`);
      }
      throw error;
    }
  }
}

/**
 * searchOpenStreetMap
 */
export async function searchOpenStreetMap(
  options: SearchOptions,
  scraperOptions?: Partial<OverpassOptions>
): Promise<LocalBusiness[]> {
  const scraper = new OpenStreetMapScraper(scraperOptions);
  return await scraper.search(options);
}

/**
 * searchByOverpassTags
 */
export async function searchByOverpassTags(
  tags: Record<string, string>,
  bbox: BoundingBox,
  options?: Partial<OverpassOptions>
): Promise<LocalBusiness[]> {
  const scraper = new OpenStreetMapScraper(options);
  return await scraper.searchByTags(tags, bbox, options);
}
