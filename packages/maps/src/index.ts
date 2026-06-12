export { OpenStreetMapService } from './providers/openstreetmap-api';
export { MapsOrchestrator } from './orchestrator-api';
export type { MapsConfig } from './orchestrator-api';
export { MapsError, toMapsError, MAPS_ERROR_MESSAGES } from './errors';
export type { MapsErrorCode } from './errors';

export * from './types';
export * from './providers/openstreetmap';
export * from './queries/categories';
export * from './queries/filters';
export * from './utils/geocoding';
export * from './utils/deduplication';

import type { LocalBusiness, SearchOptions, SearchResult } from './types';
import { OpenStreetMapScraper, searchOpenStreetMap } from './providers/openstreetmap';
import { applyFilters } from './queries/filters';

export async function searchBusinesses(options: SearchOptions): Promise<SearchResult> {
  try {
    const businesses: LocalBusiness[] = await searchOpenStreetMap(options);

    const filtered = applyFilters(businesses, {
      hasWebsite: options.hasWebsite,
      category: options.category,
      limit: options.limit,
    });

    return {
      businesses: filtered,
      totalCount: filtered.length,
      source: 'openstreetmap',
      query: options.query || options.category || 'business',
    };
  } catch (error) {
    throw new Error(`Business search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export { OpenStreetMapScraper };
