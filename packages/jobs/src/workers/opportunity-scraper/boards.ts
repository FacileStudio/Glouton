import { scrapeCodeur } from './scrapers/codeur';
import { scrapeFreeWork } from './scrapers/freework';
import { scrapeHimalayas } from './scrapers/himalayas';
import { scrapeHNHiring } from './scrapers/hn-hiring';
import { scrapeJobicy } from './scrapers/jobicy';
import { scrapeRemoteOK } from './scrapers/remoteok';
import { scrapeRemotive } from './scrapers/remotive';
import type { BoardQuery, ScrapedOpportunity } from './scrapers/types';
import { scrapeWeWorkRemotely } from './scrapers/weworkremotely';

/** One job board a job search queries with its own terms. */
export interface JobBoard {
  name: string;
  search: (query: BoardQuery) => Promise<ScrapedOpportunity[]>;
}

/** The boards the missions scraper reads, opened to any trade for job searches. */
export const JOB_BOARDS: readonly JobBoard[] = [
  { name: 'freework', search: scrapeFreeWork },
  { name: 'codeur', search: scrapeCodeur },
  { name: 'remotive', search: scrapeRemotive },
  { name: 'remoteok', search: scrapeRemoteOK },
  { name: 'weworkremotely', search: scrapeWeWorkRemotely },
  { name: 'hn-hiring', search: scrapeHNHiring },
  { name: 'jobicy', search: scrapeJobicy },
  { name: 'himalayas', search: scrapeHimalayas },
];
