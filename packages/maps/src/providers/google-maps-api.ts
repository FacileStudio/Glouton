import { Client, PlaceInputType, PlacesNearbyRanking } from '@googlemaps/google-maps-services-js';
import type { LocalBusiness, SearchResult, Coordinates } from '../types';

interface SearchOptions {
  location: string;
  category: string;
  radius?: number;
  maxResults?: number;
  hasWebsite?: boolean;
}

export class GoogleMapsService {
  private client: Client;
  private apiKey: string;

  /**
   * constructor
   */
  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = new Client({});
  }

  /**
   * geocode
   */
  async geocode(location: string): Promise<Coordinates> {
    try {
      const response = await this.client.geocode({
        params: {
          address: location,
          key: this.apiKey,
        },
      });

      /**
       * if
       */
      if (response.data.results.length === 0) {
        throw new Error(`Could not geocode location: ${location}`);
      }

      const { lat, lng } = response.data.results[0].geometry.location;
      return { lat, lng };
    } catch (error) {
      throw new Error(`Geocoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * searchNearby
   */
  async searchNearby(options: SearchOptions): Promise<SearchResult> {
    try {
      const coordinates = await this.geocode(options.location);
      const radius = options.radius || 5000;
      const maxResults = options.maxResults || 50;

      const response = await this.client.placesNearby({
        params: {
          location: coordinates,
          radius,
          keyword: options.category,
          key: this.apiKey,
        },
      });

      let results = response.data.results || [];

      /**
       * if
       */
      if (options.hasWebsite !== undefined) {
        results = results.filter(place => {
          const hasWebsite = !!place.website;
          return options.hasWebsite ? hasWebsite : !hasWebsite;
        });
      }

      const limitedResults = results.slice(0, maxResults);

      const businesses: LocalBusiness[] = await Promise.all(
        limitedResults.map(async (place) => {
          let website: string | undefined;
          let phone: string | undefined;
          let openingHours: string | undefined;

          /**
           * if
           */
          if (place.place_id) {
            try {
              const detailsResponse = await this.client.placeDetails({
                params: {
                  place_id: place.place_id,
                  fields: ['website', 'formatted_phone_number', 'opening_hours'],
                  key: this.apiKey,
                },
              });

              const details = detailsResponse.data.result;
              website = details.website;
              phone = details.formatted_phone_number;

              /**
               * if
               */
              if (details.opening_hours?.weekday_text) {
                openingHours = details.opening_hours.weekday_text.join('; ');
              }
            } catch (error) {
              console.error(`Failed to fetch details for ${place.name}:`, error);
            }
          }

          return {
            source: 'google-maps' as const,
            name: place.name || 'Unknown',
            address: place.vicinity,
            phone,
            website,
            hasWebsite: !!website,
            category: place.types?.[0] || options.category,
            rating: place.rating,
            reviewCount: place.user_ratings_total,
            coordinates: {
              lat: place.geometry?.location.lat || 0,
              lng: place.geometry?.location.lng || 0,
            },
            openingHours,
          };
        })
      );

      return {
        businesses,
        totalCount: businesses.length,
        source: 'google_maps',
        query: options.category,
      };
    } catch (error) {
      throw new Error(`Google Maps search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * searchByText
   */
  async searchByText(query: string, location?: string): Promise<SearchResult> {
    try {
      const params: any = {
        query,
        key: this.apiKey,
      };

      /**
       * if
       */
      if (location) {
        const coordinates = await this.geocode(location);
        params.location = coordinates;
        params.radius = 10000;
      }

      const response = await this.client.textSearch({ params });

      const results = response.data.results || [];

      const businesses: LocalBusiness[] = await Promise.all(
        results.map(async (place) => {
          let website: string | undefined;
          let phone: string | undefined;
          let openingHours: string | undefined;

          /**
           * if
           */
          if (place.place_id) {
            try {
              const detailsResponse = await this.client.placeDetails({
                params: {
                  place_id: place.place_id,
                  fields: ['website', 'formatted_phone_number', 'opening_hours'],
                  key: this.apiKey,
                },
              });

              const details = detailsResponse.data.result;
              website = details.website;
              phone = details.formatted_phone_number;

              /**
               * if
               */
              if (details.opening_hours?.weekday_text) {
                openingHours = details.opening_hours.weekday_text.join('; ');
              }
            } catch (error) {
              console.error(`Failed to fetch details for ${place.name}:`, error);
            }
          }

          return {
            source: 'google-maps' as const,
            name: place.name || 'Unknown',
            address: place.formatted_address,
            phone,
            website,
            hasWebsite: !!website,
            category: place.types?.[0] || 'business',
            rating: place.rating,
            reviewCount: place.user_ratings_total,
            coordinates: {
              lat: place.geometry?.location.lat || 0,
              lng: place.geometry?.location.lng || 0,
            },
            openingHours,
          };
        })
      );

      return {
        businesses,
        totalCount: businesses.length,
        source: 'google_maps',
        query,
      };
    } catch (error) {
      throw new Error(`Google Maps text search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
