export { GoogleMapsService } from './providers/google-maps-api';
export { OpenStreetMapService } from './providers/openstreetmap-api';
export { MapsOrchestrator } from './orchestrator-api';
export type { MapsConfig } from './orchestrator-api';

export * from './types';
export * from './providers/google-maps';
export * from './providers/openstreetmap';
export * from './queries/categories';
export * from './queries/filters';
export * from './utils/geocoding';
export * from './utils/deduplication';

import type { LocalBusiness, SearchOptions, SearchResult } from './types';
import {
  GoogleMapsScraper,
  searchGoogleMaps,
  searchGoogleMapsDetailed,
} from './providers/google-maps';
import { OpenStreetMapScraper, searchOpenStreetMap } from './providers/openstreetmap';
import { deduplicateBusinesses } from './utils/deduplication';
import { applyFilters } from './queries/filters';

/**
 * searchBusinesses
 */
export async function searchBusinesses(options: SearchOptions): Promise<SearchResult> {
  const source = options.source || 'all';
  const businesses: LocalBusiness[] = [];

  try {
    /**
     * if
     */
    if (source === 'google-maps' || source === 'all') {
      try {
        const gmapsResults = await searchGoogleMaps(options);
        businesses.push(...gmapsResults);
      } catch (error) {
        console.error('Google Maps search failed:', error);
        /**
         * if
         */
        if (source === 'google-maps') throw error;
      }
    }

    /**
     * if
     */
    if (source === 'openstreetmap' || source === 'all') {
      try {
        const osmResults = await searchOpenStreetMap(options);
        businesses.push(...osmResults);
      } catch (error) {
        console.error('OpenStreetMap search failed:', error);
        /**
         * if
         */
        if (source === 'openstreetmap') throw error;
      }
    }

    const deduplicated = source === 'all' ? deduplicateBusinesses(businesses) : businesses;

    const filtered = applyFilters(deduplicated, {
      hasWebsite: options.hasWebsite,
      category: options.category,
      limit: options.limit,
    });

    return {
      businesses: filtered,
      totalCount: filtered.length,
      source: source,
      query: options.query || options.category || 'business',
    };
  } catch (error) {
    throw new Error(`Business search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * searchBusinessesDetailed
 */
export async function searchBusinessesDetailed(options: SearchOptions): Promise<SearchResult> {
  const source = options.source || 'google-maps';

  /**
   * if
   */
  if (source === 'openstreetmap' || source === 'all') {
    return searchBusinesses(options);
  }

  try {
    const businesses = await searchGoogleMapsDetailed(options);

    const filtered = applyFilters(businesses, {
      hasWebsite: options.hasWebsite,
      category: options.category,
      limit: options.limit,
    });

    return {
      businesses: filtered,
      totalCount: filtered.length,
      source: 'google-maps',
      query: options.query || options.category || 'business',
    };
  } catch (error) {
    throw new Error(
      `Detailed business search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export { GoogleMapsScraper, OpenStreetMapScraper };
