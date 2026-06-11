export interface OpportunityScraperData {
  triggeredBy?: string;
}

export interface ScraperStats {
  source: string;
  found: number;
  inserted: number;
  skipped: number;
  error?: string;
}

export interface OpportunityScraperResult {
  stats: ScraperStats[];
  totalInserted: number;
  totalFound: number;
  durationMs: number;
}
