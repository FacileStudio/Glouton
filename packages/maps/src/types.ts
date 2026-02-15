export interface LocalBusiness {
  source: 'google-maps' | 'openstreetmap';
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  phone?: string;
  website?: string;
  hasWebsite: boolean;
  category?: string;
  rating?: number;
  reviewCount?: number;
  coordinates?: { lat: number; lng: number };
  openingHours?: string;
  metadata?: Record<string, any>;
}

export interface SearchOptions {
  query?: string;
  location?: string | BoundingBox | Coordinates;
  category?: BusinessCategory;
  hasWebsite?: boolean;
  limit?: number;
  source?: 'google-maps' | 'openstreetmap' | 'all';
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export type BusinessCategory =
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'hotel'
  | 'retail'
  | 'office'
  | 'service'
  | 'healthcare'
  | 'education'
  | 'entertainment'
  | 'automotive'
  | 'real-estate'
  | 'finance'
  | 'beauty'
  | 'fitness'
  | 'travel'
  | 'food-delivery'
  | 'grocery'
  | 'pharmacy'
  | 'pet-services'
  | 'home-services'
  | 'professional-services'
  | 'other';

export interface GoogleMapsScraperOptions {
  headless?: boolean;
  timeout?: number;
  maxResults?: number;
  delayBetweenScrolls?: number;
  delayAfterSearch?: number;
}

export interface OverpassOptions {
  timeout?: number;
  maxResults?: number;
}

export interface SearchResult {
  businesses: LocalBusiness[];
  totalCount: number;
  source: string;
  query: string;
}
