export { WebScraper, scrapeWebsite, scrapeWebsites } from './scraper';
export { SmartScraper, smartScrapeWebsite } from './smart-scraper';
export { StealthBrowser } from './stealth/browser';
export { BrowserPool } from './pool/browser-pool';
export { ScraperCache, getScraperCache } from './cache/scraper-cache';
export {
  getRandomUserAgent,
  generateFingerprint,
  FingerprintRotator,
  generateBrowserHeaders,
} from './stealth/fingerprint';
export { extractEmails, extractEmailsWithConfidence } from './extractors/email';
export { extractPhones, extractPhonesWithConfidence } from './extractors/phone';
export { extractAddresses, extractAddressesWithConfidence } from './extractors/address';
export { extractSocialProfiles, extractSocialProfilesWithConfidence } from './extractors/social';
export * from './types';
export * from './utils/patterns';
export * from './utils/parser';
