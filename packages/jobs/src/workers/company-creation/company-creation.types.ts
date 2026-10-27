export interface DirectorInfo {
  name: string;
  role?: string;
}

export interface ScrapedCompanyCreation {
  country: 'FR' | 'GB' | 'DE';
  registrationId: string;
  name: string;
  legalForm?: string;
  activityCode?: string;
  activityLabel?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  region?: string;
  capital?: number;
  currency?: string;
  directors?: DirectorInfo[];
  sourceUrl?: string;
  publishedAt: Date;
  hasWebsite?: boolean;
  websiteUrl?: string;
  domain?: string;
  email?: string;
  phone?: string;
}

export interface CompanyCreationData {
  triggeredBy?: string;
  countries?: Array<'FR' | 'GB' | 'DE'>;
  limit?: number;
}

export interface CompanyScraperStats {
  source: string;
  country: 'FR' | 'GB' | 'DE';
  found: number;
  inserted: number;
  skipped: number;
  error?: string;
}

export interface CompanyCreationProgress {
  percent: number;
  source: string;
  sourcesDone: number;
  sourcesTotal: number;
  totalInserted: number;
  totalFound: number;
}

export interface CompanyCreationResult {
  stats: CompanyScraperStats[];
  totalInserted: number;
  totalFound: number;
  durationMs: number;
}
