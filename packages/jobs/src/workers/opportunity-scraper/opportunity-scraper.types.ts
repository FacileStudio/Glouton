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
