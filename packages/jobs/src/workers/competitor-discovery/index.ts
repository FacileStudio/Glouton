import { OpenStreetMapService, calculateDistance, type LocalBusiness } from '@repo/maps';

/** One place near the area, in the shape competitor discovery reads. */
export interface NearbyPlace {
  name: string;
  website: string | null;
  city: string | null;
  address: string | null;
  category: string | null;
  url: string | null;
  distanceKm: number | null;
}

/** Search radius around the area's centre, and the most places one search returns. */
export const PLACES_RADIUS_M = 15_000;
export const PLACES_MAX = 60;

/** The OpenStreetMap page of a place id such as `osm_node_123`. */
export function osmUrl(id: unknown): string | null {
  const match = typeof id === 'string' ? /^osm_(node|way|relation)_(\d+)$/.exec(id) : null;
  return match ? `https://www.openstreetmap.org/${match[1]}/${match[2]}` : null;
}

/**
 * Map search for competitor discovery: places of one category with a
 * website within PLACES_RADIUS_M of the area, through the shared
 * OpenStreetMap service (its Nominatim and Overpass pacing apply), each with
 * its distance from the area's centre in km.
 */
export function osmPlaces(service: OpenStreetMapService = new OpenStreetMapService()) {
  return async (area: string, category: string): Promise<NearbyPlace[]> => {
    const center = await service.geocode(area);
    const found = await service.searchNearby({ location: area, category, radius: PLACES_RADIUS_M, maxResults: PLACES_MAX, hasWebsite: true });
    return found.businesses.map((place: LocalBusiness & { id?: unknown }) => ({
      name: place.name,
      website: place.website ?? null,
      city: place.city ?? null,
      address: place.address ?? null,
      category: place.category ?? null,
      url: osmUrl(place.id),
      distanceKm: place.coordinates ? calculateDistance(center, place.coordinates) : null,
    }));
  };
}
