import type { BoundingBox, Coordinates } from '../types';

interface NominatimResult {
  boundingbox: [string, string, string, string];
  lat: string;
  lon: string;
  display_name: string;
}



async function geocodeCity(city: string): Promise<BoundingBox | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Glouton-LeadHunter/1.0',
      },
    });

    

    if (!response.ok) {
      return null;
    }

    const data: NominatimResult[] = await response.json();

    

    if (data.length === 0) {
      return null;
    }

    const [south, north, west, east] = data[0].boundingbox.map(Number);

    const bbox = {
      south,
      west,
      north,
      east,
    };

    return bbox;
  } catch (error) {
    return null;
  }
}



export async function cityToBoundingBox(city: string): Promise<BoundingBox | null> {
  return await geocodeCity(city);
}



export function coordinatesToBoundingBox(
  coords: Coordinates,
  radiusKm: number = 5
): BoundingBox {
  const earthRadiusKm = 6371;
  

  const latDelta = (radiusKm / earthRadiusKm) * (180 / Math.PI);
  

  const lngDelta = (radiusKm / (earthRadiusKm * Math.cos((coords.lat * Math.PI) / 180))) * (180 / Math.PI);

  return {
    south: coords.lat - latDelta,
    west: coords.lng - lngDelta,
    north: coords.lat + latDelta,
    east: coords.lng + lngDelta,
  };
}



export function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
  const R = 6371;
  

  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  

  const dLon = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.lat * Math.PI) / 180) *
      Math.cos((coord2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}



export function expandBoundingBox(bbox: BoundingBox, percentIncrease: number = 10): BoundingBox {
  const latRange = bbox.north - bbox.south;
  const lngRange = bbox.east - bbox.west;

  

  const latExpansion = (latRange * percentIncrease) / 100 / 2;
  

  const lngExpansion = (lngRange * percentIncrease) / 100 / 2;

  return {
    south: bbox.south - latExpansion,
    west: bbox.west - lngExpansion,
    north: bbox.north + latExpansion,
    east: bbox.east + lngExpansion,
  };
}



export function isWithinBoundingBox(coords: Coordinates, bbox: BoundingBox): boolean {
  

  return (
    coords.lat >= bbox.south &&
    coords.lat <= bbox.north &&
    coords.lng >= bbox.west &&
    coords.lng <= bbox.east
  );
}
