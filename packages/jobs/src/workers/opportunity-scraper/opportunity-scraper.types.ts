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

/** Compact summary of a freshly created opportunity, used for webhook notifications */
export interface NewOpportunitySummary {
  id: string;
  title: string;
  company: string | null;
  source: string;
  budget: string | null;
  relevanceScore: number;
  url: string;
}

export interface OpportunityScraperResult {
  stats: ScraperStats[];
  totalInserted: number;
  totalFound: number;
  /** Opportunities created (not just refreshed) during this run */
  newOpportunities: NewOpportunitySummary[];
  durationMs: number;
}

export interface ScrapeProgress {
  /** 0-100 */
  percent: number;
  /** Source currently being scraped (or just finished) */
  source: string;
  sourcesDone: number;
  sourcesTotal: number;
  totalInserted: number;
  totalFound: number;
}
