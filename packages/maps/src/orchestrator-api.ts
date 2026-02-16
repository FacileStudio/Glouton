import { GoogleMapsService } from './providers/google-maps-api';
import { OpenStreetMapService } from './providers/openstreetmap-api';
import type { LocalBusiness, Coordinates } from './types';

interface SearchOptions {
  location: string;
  category: string;
  radius?: number;
  maxResults?: number;
  hasWebsite?: boolean;
}

export interface MapsConfig {
  googleMapsApiKey?: string;
  useGoogleMaps?: boolean;
  useOpenStreetMap?: boolean;
}

export class MapsOrchestrator {
  private googleMaps?: GoogleMapsService;
  private openStreetMap: OpenStreetMapService;
  private config: Required<MapsConfig>;

  constructor(config: MapsConfig = {}) {
    this.config = {
      googleMapsApiKey: config.googleMapsApiKey || '',
      useGoogleMaps: config.useGoogleMaps !== false && !!config.googleMapsApiKey,
      useOpenStreetMap: config.useOpenStreetMap !== false,
    };

    if (this.config.useGoogleMaps && this.config.googleMapsApiKey) {
      this.googleMaps = new GoogleMapsService(this.config.googleMapsApiKey);
    }

    this.openStreetMap = new OpenStreetMapService();
  }

  async search(options: SearchOptions): Promise<LocalBusiness[]> {
    const results: LocalBusiness[] = [];
    const errors: Error[] = [];

    const promises: Promise<void>[] = [];

    if (this.config.useGoogleMaps && this.googleMaps) {
      promises.push(
        this.googleMaps
          .searchNearby(options)
          .then((result: any) => {
            results.push(...result.businesses);
          })
          .catch((error: any) => {
            console.error('[GoogleMaps] Search failed:', error);
            errors.push(error);
          })
      );
    }

    if (this.config.useOpenStreetMap) {
      promises.push(
        this.openStreetMap
          .searchNearby(options)
          .then((result: any) => {
            results.push(...result.businesses);
          })
          .catch((error: any) => {
            console.error('[OpenStreetMap] Search failed:', error);
            errors.push(error);
          })
      );
    }

    await Promise.all(promises);

    if (results.length === 0 && errors.length > 0) {
      throw new Error(`All map services failed: ${errors.map(e => e.message).join('; ')}`);
    }

    const deduplicated = this.deduplicateBusinesses(results);

    return deduplicated.slice(0, options.maxResults || 100);
  }

  private deduplicateBusinesses(businesses: LocalBusiness[]): LocalBusiness[] {
    const seen = new Map<string, LocalBusiness>();
    const DISTANCE_THRESHOLD = 50;

    for (const business of businesses) {
      if (!business.coordinates) continue;

      let isDuplicate = false;
      const seenArray = [...seen.values()];

      for (const existing of seenArray) {
        if (!existing.coordinates) continue;

        const distance = this.calculateDistance(
          business.coordinates,
          existing.coordinates
        );

        const namesSimilar = this.areNamesSimilar(business.name, existing.name);

        if (distance < DISTANCE_THRESHOLD && namesSimilar) {
          isDuplicate = true;

          if (business.source === 'google-maps' && !existing.website && business.website) {
            existing.website = business.website;
          }
          if (!existing.phone && business.phone) {
            existing.phone = business.phone;
          }
          break;
        }
      }

      if (!isDuplicate) {
        seen.set(business.name, business);
      }
    }

    return [...seen.values()];
  }

  private calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371e3;
    const φ1 = (coord1.lat * Math.PI) / 180;
    const φ2 = (coord2.lat * Math.PI) / 180;
    const Δφ = ((coord2.lat - coord1.lat) * Math.PI) / 180;
    const Δλ = ((coord2.lng - coord1.lng) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private areNamesSimilar(name1: string, name2: string): boolean {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();

    const n1 = normalize(name1);
    const n2 = normalize(name2);

    if (n1 === n2) return true;

    if (n1.includes(n2) || n2.includes(n1)) return true;

    const levenshtein = (a: string, b: string): number => {
      const matrix: number[][] = [];

      for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
      }

      for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
      }

      for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
          if (b.charAt(i - 1) === a.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            );
          }
        }
      }

      return matrix[b.length][a.length];
    };

    const distance = levenshtein(n1, n2);
    const maxLength = Math.max(n1.length, n2.length);
    const similarity = 1 - distance / maxLength;

    return similarity > 0.85;
  }

  async geocode(location: string): Promise<Coordinates> {
    if (this.googleMaps) {
      try {
        return await this.googleMaps.geocode(location);
      } catch (error) {
        console.error('[GoogleMaps] Geocoding failed, falling back to OSM:', error);
      }
    }

    return this.openStreetMap.geocode(location);
  }
}
