export type LeadSource = 'HUNTER' | 'MANUAL';

export interface LeadSourceFilters {
  domain?: string;
  limit?: number;
  offset?: number;

  type?: 'personal' | 'generic';
  seniority?: ('junior' | 'senior' | 'executive')[];
  department?: string[];
  jobTitles?: string[];
  requiredFields?: ('full_name' | 'position' | 'phone_number')[];
  verificationStatus?: ('valid' | 'accept_all' | 'unknown')[];

  location?: {
    continent?: string;
    businessRegion?: 'AMER' | 'EMEA' | 'APAC' | 'LATAM';
    country?: string;
    state?: string;
    city?: string;
  };

  customFilters?: Record<string, any>;
}

export interface LeadData {
  sourceId: string;
  domain?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  department?: string;
  confidence: number;
  verified?: boolean;
  phoneNumber?: string;
  metadata?: Record<string, any>;
}

export interface LeadSourceResult {
  leads: LeadData[];
  total: number;
  hasMore: boolean;
}

export interface RateLimitInfo {
  remaining: number;
  total: number;
  resetAt: Date;
}

export interface LeadSourceProvider {
  readonly name: LeadSource;
  readonly supportsFilters: {
    type: boolean;
    seniority: boolean;
    department: boolean;
    jobTitles: boolean;
    location: boolean;
    verificationStatus: boolean;
  };

  

  search(filters: LeadSourceFilters): Promise<LeadSourceResult>;
  verify?(email: string): Promise<{ valid: boolean; score: number }>;
  getRateLimit?(): Promise<RateLimitInfo>;
}
