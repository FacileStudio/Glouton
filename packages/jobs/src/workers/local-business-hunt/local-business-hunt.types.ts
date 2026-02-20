export interface LocalBusinessHuntData {
  huntSessionId: string;
  userId: string;
  location: string;
  category: string;
  hasWebsite?: boolean;
  radius?: number;
  maxResults?: number;
  googleMapsApiKey?: string;
}

export interface BusinessFilters {
  location: string;
  category: string;
  radius: number;
  maxResults: number;
  hasWebsite?: boolean;
}
