import type { LocalBusiness, SearchResult, Coordinates } from '../types';

interface SearchOptions {
  location: string;
  category: string;
  radius?: number;
  maxResults?: number;
  hasWebsite?: boolean;
}

class OverpassApi {
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 1000; // Minimum 1 second between requests

  constructor(_config: any) {}

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await this.delay(waitTime);
    }
    this.lastRequestTime = Date.now();
  }

  async exec(query: string): Promise<any> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Apply rate limiting
        await this.waitForRateLimit();

        const response = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: query,
          headers: { 'Content-Type': 'text/plain' },
        });

        // Check if response is OK
        if (!response.ok) {
          const text = await response.text();

          // Handle rate limiting specifically
          if (response.status === 429) {
            const retryDelay = Math.min(Math.pow(2, attempt + 1) * 1000, 30000); // Exponential backoff: 2s, 4s, 8s...
            console.log(`[OverpassApi] Rate limited (429), waiting ${retryDelay}ms before retry ${attempt + 1}/${maxRetries}`);

            if (attempt < maxRetries - 1) {
              await this.delay(retryDelay);
              // Increase minimum interval after rate limiting
              this.minRequestInterval = Math.min(this.minRequestInterval * 2, 10000);
              continue;
            }
          }

          throw new Error(`Overpass API returned ${response.status}: ${text.substring(0, 200)}`);
        }

      // Check Content-Type to ensure it's JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Try to read as text first to debug
        const text = await response.text();

        // Check for common error patterns
        if (text.includes('rate_limited')) {
          throw new Error('Overpass API rate limit exceeded. Please wait before retrying.');
        }
        if (text.includes('timeout')) {
          throw new Error('Overpass API query timeout. Try reducing the search radius.');
        }
        if (text.includes('error') || text.includes('Error')) {
          throw new Error(`Overpass API error: ${text.substring(0, 200)}`);
        }

        // Try to parse as JSON anyway
        try {
          return JSON.parse(text);
        } catch (parseError) {
          throw new Error(`Overpass API returned non-JSON response: ${text.substring(0, 200)}`);
        }
      }

        const data = await response.json();

        // Validate the response structure
        if (!data || typeof data !== 'object') {
          throw new Error('Overpass API returned invalid data structure');
        }

        // Success! Reset the rate limiting interval back to normal
        if (this.minRequestInterval > 1000) {
          this.minRequestInterval = Math.max(1000, this.minRequestInterval / 2);
        }

        return data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error occurred');

        if (attempt < maxRetries - 1) {
          // Don't retry on non-retryable errors
          if (lastError.message.includes('Overpass API returned invalid data structure') ||
              lastError.message.includes('non-JSON response')) {
            throw lastError;
          }

          // For network errors, add a delay before retry
          if (lastError.message.includes('Failed to fetch')) {
            const retryDelay = Math.min(Math.pow(2, attempt + 1) * 1000, 10000);
            console.log(`[OverpassApi] Network error, waiting ${retryDelay}ms before retry ${attempt + 1}/${maxRetries}`);
            await this.delay(retryDelay);
            continue;
          }
        }
      }
    }

    // All retries failed
    if (lastError) {
      if (lastError.message.includes('Failed to fetch')) {
        throw new Error('Failed to connect to Overpass API. Please check your internet connection.');
      }
      throw lastError;
    }

    throw new Error('Unknown error occurred while querying Overpass API');
  }
}

// Singleton instance to maintain rate limiting across all usages
let openStreetMapServiceInstance: OpenStreetMapService | null = null;

export class OpenStreetMapService {
  private api: OverpassApi;
  private lastNominatimRequest: number = 0;
  private nominatimMinInterval: number = 1000; // Nominatim requires min 1 second between requests

  constructor() {
    // Return singleton instance to maintain rate limiting
    if (openStreetMapServiceInstance) {
      return openStreetMapServiceInstance;
    }

    this.api = new OverpassApi({
      endpoint: 'https://overpass-api.de/api',
      rateLimitPadding: 1000,
    });

    openStreetMapServiceInstance = this;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async waitForNominatimRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastNominatimRequest;
    if (timeSinceLastRequest < this.nominatimMinInterval) {
      const waitTime = this.nominatimMinInterval - timeSinceLastRequest;
      await this.delay(waitTime);
    }
    this.lastNominatimRequest = Date.now();
  }

  async geocode(location: string): Promise<Coordinates> {
    try {
      // Apply rate limiting for Nominatim
      await this.waitForNominatimRateLimit();

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
        {
          headers: {
            'User-Agent': 'Glouton-Maps/1.0',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Nominatim API error (${response.status}): ${errorText.substring(0, 200)}`);
      }

      // Check Content-Type
      const contentType = response.headers.get('content-type');
      let data;

      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          throw new Error(`Nominatim returned non-JSON response: ${text.substring(0, 200)}`);
        }
      } else {
        data = await response.json();
      }

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error(`Could not geocode location: ${location}`);
      }

      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);

      if (isNaN(lat) || isNaN(lng)) {
        throw new Error(`Invalid coordinates returned for location: ${location}`);
      }

      return { lat, lng };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch')) {
          throw new Error(`Cannot connect to Nominatim API. Please check your internet connection.`);
        }
        throw new Error(`Geocoding failed for "${location}": ${error.message}`);
      }
      throw new Error(`Geocoding failed: Unknown error`);
    }
  }

  private getCategoryFilters(category: string): Array<{ key: string; value?: string }> {
    const categoryMap: Record<string, Array<{ key: string; value?: string }>> = {
      restaurant: [{ key: 'amenity', value: 'restaurant' }],
      cafe: [{ key: 'amenity', value: 'cafe' }],
      bar: [{ key: 'amenity', value: 'bar' }],
      retail: [{ key: 'shop' }],
      office: [{ key: 'office' }],
      hotel: [{ key: 'tourism', value: 'hotel' }],
      bank: [{ key: 'amenity', value: 'bank' }],
      pharmacy: [{ key: 'amenity', value: 'pharmacy' }],
      store: [{ key: 'shop' }],
      supermarket: [{ key: 'shop', value: 'supermarket' }],
      service: [{ key: 'shop' }],
      'professional-services': [{ key: 'office' }],
      healthcare: [
        { key: 'amenity', value: 'doctors' },
        { key: 'amenity', value: 'dentist' },
        { key: 'amenity', value: 'hospital' },
      ],
      fitness: [
        { key: 'leisure', value: 'fitness_centre' },
        { key: 'leisure', value: 'sports_centre' },
      ],
      beauty: [
        { key: 'shop', value: 'beauty' },
        { key: 'shop', value: 'hairdresser' },
      ],
      automotive: [
        { key: 'shop', value: 'car_repair' },
        { key: 'amenity', value: 'fuel' },
      ],
      education: [
        { key: 'amenity', value: 'school' },
        { key: 'amenity', value: 'college' },
        { key: 'amenity', value: 'university' },
      ],
      entertainment: [
        { key: 'amenity', value: 'cinema' },
        { key: 'amenity', value: 'theatre' },
        { key: 'leisure', value: 'amusement_arcade' },
      ],
    };

    const normalized = category.toLowerCase().replace(/_/g, '-');
    const filters = categoryMap[normalized];
    if (filters) return filters;

    if (normalized.includes('shop') || normalized.includes('store')) {
      return [{ key: 'shop' }];
    }
    if (normalized.includes('food') || normalized.includes('restaurant')) {
      return [
        { key: 'amenity', value: 'restaurant' },
        { key: 'amenity', value: 'cafe' },
        { key: 'amenity', value: 'fast_food' },
      ];
    }
    if (normalized.includes('service')) {
      return [{ key: 'shop' }];
    }

    console.log(`[OpenStreetMap] Warning: Unknown category "${category}", defaulting to shop search`);
    return [{ key: 'shop' }];
  }

  private buildOverpassUnion(
    filters: Array<{ key: string; value?: string }>,
    radius: number,
    lat: number,
    lng: number
  ): string {
    const lines: string[] = [];
    for (const f of filters) {
      const tag = f.value ? `["${f.key}"="${f.value}"]` : `["${f.key}"]`;
      lines.push(`  node${tag}(around:${radius},${lat},${lng});`);
      lines.push(`  way${tag}(around:${radius},${lat},${lng});`);
      lines.push(`  relation${tag}(around:${radius},${lat},${lng});`);
    }
    return lines.join('\n');
  }

  async searchNearby(options: SearchOptions): Promise<SearchResult> {
    try {
      const coordinates = await this.geocode(options.location);
      let radius = options.radius || 5000;
      const filters = this.getCategoryFilters(options.category);

      let attempts = 0;
      let response;
      let lastError;

      while (attempts < 3 && !response) {
        attempts++;

        if (attempts > 1) {
          radius = Math.floor(radius * 0.6);
          console.log(`[OpenStreetMap] Retrying with smaller radius: ${radius}m`);
        }

        const timeout = radius > 3000 ? 25 : 15;
        const unionBody = this.buildOverpassUnion(filters, radius, coordinates.lat, coordinates.lng);

        const query = `[out:json][timeout:${timeout}];\n(\n${unionBody}\n);\nout center;`;

        console.log(`[OpenStreetMap] Searching for ${options.category} near ${options.location} (${coordinates.lat}, ${coordinates.lng}) with radius ${radius}m`);

        try {
          response = await this.api.exec(query);

          if (!response || typeof response !== 'object') {
            throw new Error('Invalid response structure from Overpass API');
          }
        } catch (error) {
          lastError = error;

          if (error instanceof Error && (error.message.includes('504') || error.message.includes('timeout'))) {
            console.log(`[OpenStreetMap] Query timed out, will retry with smaller radius`);
            continue;
          }

          throw error;
        }
      }

      if (!response && lastError) {
        throw lastError;
      }

      const elements = response?.elements || [];

      console.log(`[OpenStreetMap] Found ${elements.length} raw elements from Overpass API`);

      const businesses: LocalBusiness[] = elements
        .filter((element: any) => element.tags && element.tags.name)
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
              tags['addr:housenumber'],
              tags['addr:street'],
            ]
              .filter(Boolean)
              .join(' ') || undefined,
            city: tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || undefined,
            country: tags['addr:country'] || undefined,
            postalCode: tags['addr:postcode'] || undefined,
            phone: tags.phone || tags['contact:phone'] || undefined,
            email: tags.email || tags['contact:email'] || undefined,
            website: tags.website || tags['contact:website'] || undefined,
            openingHours,
            source: 'openstreetmap' as const,
            hasWebsite,
          };
        })
        .filter((b: LocalBusiness | null): b is LocalBusiness => b !== null)
        .filter((b: LocalBusiness) => b.coordinates && (b.coordinates.lat !== 0 || b.coordinates.lng !== 0));

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
      // Apply rate limiting for Nominatim
      await this.waitForNominatimRateLimit();

      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${coordinates.lat}&lon=${coordinates.lng}&format=json`,
        {
          headers: {
            'User-Agent': 'Glouton-Maps/1.0',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Nominatim API error (${response.status}): ${errorText.substring(0, 200)}`);
      }

      // Check Content-Type
      const contentType = response.headers.get('content-type');
      let data;

      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          throw new Error(`Nominatim returned non-JSON response: ${text.substring(0, 200)}`);
        }
      } else {
        data = await response.json();
      }

      return data.display_name || '';
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch')) {
          throw new Error(`Cannot connect to Nominatim API. Please check your internet connection.`);
        }
        throw new Error(`Reverse geocoding failed for (${coordinates.lat}, ${coordinates.lng}): ${error.message}`);
      }
      throw new Error(`Reverse geocoding failed: Unknown error`);
    }
  }
}
