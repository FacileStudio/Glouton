export interface DomainFinderData {
  huntSessionId: string;
  userId: string;
  teamId?: string | null;
  filters?: {
    location?: {
      continent?: string;
      businessRegion?: string;
      country?: string;
      state?: string;
      city?: string;
    };
    industry?: string | string[];
    headcount?: string | string[];
    query?: string;
    limit?: number;
  };
}

export interface CompanyData {
  domain: string;
  organization?: string | null;
  industry?: string | null;
  headcount?: string | null;
  emails_count?: any;
  location?: string | null;
}
