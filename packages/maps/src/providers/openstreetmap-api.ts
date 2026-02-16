import type { LocalBusiness, SearchResult, Coordinates } from '../types';

interface SearchOptions {
  location: string;
  category: string;
  radius?: number;
  maxResults?: number;
  hasWebsite?: boolean;
}

class OverpassApi {
  constructor(_config: any) {}
  async exec(query: string): Promise<any> {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'text/plain' },
    });
    return response.json();
  }
}

export class OpenStreetMapService {
  private api: OverpassApi;

  constructor() {
    this.api = new OverpassApi({
      endpoint: 'https://overpass-api.de/api',
      rateLimitPadding: 1000,
    });
  }

  async geocode(location: string): Promise<Coordinates> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`
      );

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error(`Could not geocode location: ${location}`);
      }

      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    } catch (error) {
      throw new Error(`Geocoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getCategoryQuery(category: string): string {
    const categoryMap: Record<string, string> = {
      restaurant: 'amenity=restaurant',
      cafe: 'amenity=cafe',
      bar: 'amenity=bar',
      retail: 'shop',
      office: 'office',
      hotel: 'tourism=hotel',
      bank: 'amenity=bank',
      pharmacy: 'amenity=pharmacy',
      store: 'shop',
      supermarket: 'shop=supermarket',
    };

    const normalized = category.toLowerCase();
    return categoryMap[normalized] || `amenity=${normalized}`;
  }

  async searchNearby(options: SearchOptions): Promise<SearchResult> {
    try {
      const coordinates = await this.geocode(options.location);
      const radius = options.radius || 5000;
      const maxResults = options.maxResults || 50;
      const categoryQuery = this.getCategoryQuery(options.category);

      const query = `
        [out:json][timeout:25];
        (
          node[${categoryQuery}](around:${radius},${coordinates.lat},${coordinates.lng});
          way[${categoryQuery}](around:${radius},${coordinates.lat},${coordinates.lng});
          relation[${categoryQuery}](around:${radius},${coordinates.lat},${coordinates.lng});
        );
        out body;
        >;
        out skel qt;
      `;

      const response = await this.api.exec(query);
      const elements = response.elements || [];

      const businesses: LocalBusiness[] = elements
        .filter((element: any) => element.tags && element.tags.name)
        .slice(0, maxResults)
        .map((element: any) => {
          const tags = element.tags || {};
          const lat = element.lat || (element.center?.lat) || 0;
          const lng = element.lon || (element.center?.lon) || 0;

          const hasWebsite = !!tags.website || !!tags['contact:website'];

          if (options.hasWebsite !== undefined && hasWebsite !== options.hasWebsite) {
            return null;
          }

          const openingHours = tags.opening_hours || tags['opening_hours:covid19'] || undefined;

          return {
            id: `osm_${element.type}_${element.id}`,
            name: tags.name || 'Unknown',
            category: tags.amenity || tags.shop || tags.office || tags.tourism || options.category,
            coordinates: { lat, lng },
            address: [
              tags['addr:street'],
              tags['addr:housenumber'],
              tags['addr:city'],
              tags['addr:postcode'],
            ]
              .filter(Boolean)
              .join(', ') || undefined,
            phone: tags.phone || tags['contact:phone'] || undefined,
            email: tags.email || tags['contact:email'] || undefined,
            website: tags.website || tags['contact:website'] || undefined,
            openingHours,
            source: 'openstreetmap' as const,
          };
        })
        .filter((b: LocalBusiness | null): b is LocalBusiness => b !== null);

      return {
        businesses,
        totalCount: businesses.length,
        source: 'openstreetmap',
        query: options.category,
      };
    } catch (error) {
      throw new Error(`OpenStreetMap search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async reverseGeocode(coordinates: Coordinates): Promise<string> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${coordinates.lat}&lon=${coordinates.lng}&format=json`
      );

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.display_name || '';
    } catch (error) {
      throw new Error(`Reverse geocoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
