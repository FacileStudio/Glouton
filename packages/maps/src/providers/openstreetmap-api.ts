import type { LocalBusiness, SearchResult, Coordinates } from '../types';
import { MapsError, toMapsError } from '../errors';

interface SearchOptions {
  location: string;
  category: string;
  radius?: number;
  maxResults?: number;
  hasWebsite?: boolean;
}

const USER_AGENT = 'Glouton-Maps/1.0 (+https://glouton.facile.studio)';

/**
 * Public Overpass mirrors, tried in order. When one is rate limited or
 * unreachable it is put on cooldown and the next mirror takes over.
 */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const REQUEST_TIMEOUT_MS = 45_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const FAILURE_COOLDOWN_MS = 30_000;

class OverpassApi {
  private lastRequestTime = 0;
  private minRequestInterval = 1000;
  private cooldownUntil = new Map<string, number>();

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await this.delay(this.minRequestInterval - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();
  }

  /** Endpoints not currently on cooldown; falls back to all if every mirror is cooling down. */
  private availableEndpoints(): string[] {
    const now = Date.now();
    const available = OVERPASS_ENDPOINTS.filter(
      (endpoint) => (this.cooldownUntil.get(endpoint) ?? 0) <= now
    );
    return available.length > 0 ? available : [...OVERPASS_ENDPOINTS];
  }

  private putOnCooldown(endpoint: string, durationMs: number): void {
    this.cooldownUntil.set(endpoint, Date.now() + durationMs);
  }

  private async requestEndpoint(endpoint: string, query: string): Promise<any> {
    const response = await fetch(endpoint, {
      method: 'POST',
      // Standard Overpass form encoding + explicit Accept/User-Agent: some
      // mirrors answer 406 to anonymous text/plain POSTs.
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');

      if (response.status === 429) {
        throw new MapsError('RATE_LIMITED', `Overpass ${endpoint} returned 429`);
      }
      if (response.status === 504 || text.includes('timeout')) {
        throw new MapsError('TIMEOUT', `Overpass ${endpoint} returned ${response.status} (query timeout)`);
      }
      throw new MapsError(
        'UNAVAILABLE',
        `Overpass ${endpoint} returned ${response.status}: ${text.substring(0, 200)}`
      );
    }

    const text = await response.text();

    if (text.includes('rate_limited')) {
      throw new MapsError('RATE_LIMITED', `Overpass ${endpoint} reported rate_limited`);
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      if (text.includes('timeout')) {
        throw new MapsError('TIMEOUT', `Overpass ${endpoint} query timed out`);
      }
      throw new MapsError(
        'INVALID_RESPONSE',
        `Overpass ${endpoint} returned non-JSON response: ${text.substring(0, 200)}`
      );
    }

    if (!data || typeof data !== 'object') {
      throw new MapsError('INVALID_RESPONSE', `Overpass ${endpoint} returned invalid data structure`);
    }

    return data;
  }

  async exec(query: string): Promise<any> {
    const maxAttempts = OVERPASS_ENDPOINTS.length * 2;
    let lastError: MapsError | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const endpoints = this.availableEndpoints();
      const endpoint = endpoints[attempt % endpoints.length];

      await this.waitForRateLimit();

      try {
        const data = await this.requestEndpoint(endpoint, query);

        // Recover the request pace after a successful call.
        if (this.minRequestInterval > 1000) {
          this.minRequestInterval = Math.max(1000, this.minRequestInterval / 2);
        }

        return data;
      } catch (error) {
        lastError = toMapsError(error);
        console.warn(
          `[OverpassApi] ${endpoint} failed (${lastError.code}), attempt ${attempt + 1}/${maxAttempts}: ${lastError.message}`
        );

        switch (lastError.code) {
          case 'RATE_LIMITED':
            this.putOnCooldown(endpoint, RATE_LIMIT_COOLDOWN_MS);
            this.minRequestInterval = Math.min(this.minRequestInterval * 2, 10_000);
            break;
          case 'NETWORK':
          case 'UNAVAILABLE':
          case 'INVALID_RESPONSE':
            this.putOnCooldown(endpoint, FAILURE_COOLDOWN_MS);
            break;
          case 'TIMEOUT':
            // Query too heavy: switching mirrors will not help, let the
            // caller shrink the radius instead.
            throw lastError;
        }

        if (attempt < maxAttempts - 1) {
          const backoff = Math.min(Math.pow(2, attempt) * 1000, 10_000);
          await this.delay(backoff);
        }
      }
    }

    throw lastError ?? new MapsError('UNAVAILABLE', 'Unknown error occurred while querying Overpass API');
  }
}

let openStreetMapServiceInstance: OpenStreetMapService | null = null;

export class OpenStreetMapService {
  private api!: OverpassApi;
  private lastNominatimRequest: number = 0;
  private nominatimMinInterval: number = 1000;

  constructor() {

    if (openStreetMapServiceInstance) {
      return openStreetMapServiceInstance;
    }

    this.api = new OverpassApi();

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

      await this.waitForNominatimRateLimit();

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
        {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (response.status === 429) {
          throw new MapsError('RATE_LIMITED', `Nominatim returned 429`);
        }
        throw new MapsError(
          'UNAVAILABLE',
          `Nominatim API error (${response.status}): ${errorText.substring(0, 200)}`
        );
      }

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new MapsError(
          'INVALID_RESPONSE',
          `Nominatim returned non-JSON response: ${text.substring(0, 200)}`
        );
      }

      if (!Array.isArray(data) || data.length === 0) {
        throw new MapsError(
          'GEOCODING_FAILED',
          `Could not geocode location: ${location}`,
          `Localisation « ${location} » introuvable. Vérifiez le nom de la ville et réessayez.`
        );
      }

      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);

      if (isNaN(lat) || isNaN(lng)) {
        throw new MapsError(
          'GEOCODING_FAILED',
          `Invalid coordinates returned for location: ${location}`,
          `Localisation « ${location} » introuvable. Vérifiez le nom de la ville et réessayez.`
        );
      }

      return { lat, lng };
    } catch (error) {
      throw toMapsError(error);
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
            throw new MapsError('INVALID_RESPONSE', 'Invalid response structure from Overpass API');
          }
        } catch (error) {
          lastError = error;

          if (error instanceof MapsError && error.code === 'TIMEOUT') {
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

      const maxResults = options.maxResults || 100;

      const businesses: LocalBusiness[] = elements
        .filter((element: any) => element.tags && element.tags.name)
        .slice(0, maxResults * 3)
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
        .filter((b: LocalBusiness) => b.coordinates && (b.coordinates.lat !== 0 || b.coordinates.lng !== 0))
        .slice(0, maxResults);

      console.log(`[OpenStreetMap] Successfully found ${businesses.length} businesses`);

      return {
        businesses,
        totalCount: businesses.length,
        source: 'openstreetmap',
        query: options.category,
      };
    } catch (error) {
      throw toMapsError(error);
    }
  }

  async reverseGeocode(coordinates: Coordinates): Promise<string> {
    try {

      await this.waitForNominatimRateLimit();

      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${coordinates.lat}&lon=${coordinates.lng}&format=json`,
        {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new MapsError(
          'UNAVAILABLE',
          `Nominatim API error (${response.status}): ${errorText.substring(0, 200)}`
        );
      }

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new MapsError(
          'INVALID_RESPONSE',
          `Nominatim returned non-JSON response: ${text.substring(0, 200)}`
        );
      }

      return data.display_name || '';
    } catch (error) {
      throw toMapsError(error);
    }
  }
}
