import * as cheerio from 'cheerio';
import { extractEmails } from './extractors/email';
import { extractPhones } from './extractors/phone';
import { extractAddresses } from './extractors/address';
import { extractSocialProfiles } from './extractors/social';
import {
  parseHtml,
  extractStructuredData,
  extractCompanyInfoFromStructuredData,
  extractCompanyInfoFromMeta,
} from './utils/parser';
import { normalizeUrl } from './utils/patterns';
import type { ScrapedData, ScrapedCompanyInfo } from './types';
import { WebScraper } from './scraper';
import { logger } from '@repo/logger';
import { getScraperCache } from './cache/scraper-cache';

export interface SmartScraperOptions {
  timeout?: number;
  userAgent?: string;
  tryFetchFirst?: boolean;
  minDataThreshold?: number;
  context?: string;
  followContactPage?: boolean;
  followAboutPage?: boolean;
  includeHtml?: boolean;
}

const DEFAULT_OPTIONS: Required<SmartScraperOptions> = {
  timeout: 12000,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  tryFetchFirst: true,
  minDataThreshold: 1,
  context: 'SMART',
  followContactPage: true,
  followAboutPage: true,
  includeHtml: false,
};

export class SmartScraper {
  private options: Required<SmartScraperOptions>;

  /**
   * constructor
   */
  constructor(options: SmartScraperOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * scrape
   */
  async scrape(url: string): Promise<ScrapedData> {
    const normalizedUrl = normalizeUrl(url);
    const contextPrefix = this.options.context ? `[${this.options.context}] ` : '';

    const cache = getScraperCache();
    const cached = await cache.get(normalizedUrl);
    /**
     * if
     */
    if (cached) {
      logger.info(`${contextPrefix}Using cached data for: ${normalizedUrl}`);
      return cached;
    }

    /**
     * if
     */
    if (this.options.tryFetchFirst) {
      logger.info(`${contextPrefix}Trying fast fetch for: ${normalizedUrl}`);
      const fetchResult = await this.tryFastFetch(normalizedUrl);

      /**
       * if
       */
      if (fetchResult && this.hasEnoughData(fetchResult)) {
        logger.info(
          `${contextPrefix}Fast fetch succeeded: ${normalizedUrl} (${fetchResult.contact.emails.length} emails)`
        );
        await cache.set(normalizedUrl, fetchResult);
        return fetchResult;
      }

      logger.info(`${contextPrefix}Fast fetch insufficient, falling back to browser: ${normalizedUrl}`);
    }

    return this.scrapeWithBrowser(normalizedUrl);
  }

  /**
   * tryFastFetch
   */
  private async tryFastFetch(url: string): Promise<ScrapedData | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.options.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
        signal: controller.signal,
      });

      /**
       * if
       */
      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      return this.parseHtml(html, url);
    } catch (error) {
      logger.debug(`Fast fetch failed for ${url}:`, error);
      return null;
    } finally {
      /**
       * clearTimeout
       */
      clearTimeout(timeoutId);
    }
  }

  /**
   * parseHtml
   */
  private parseHtml(html: string, url: string): ScrapedData {
    const emails = extractEmails(html);
    const phones = extractPhones(html);
    const addresses = extractAddresses(html);
    const socialProfiles = extractSocialProfiles(html);

    const $ = cheerio.load(html);
    const pageContext = parseHtml(html, url);
    const structuredData = extractStructuredData($);
    const companyInfoFromStructured = extractCompanyInfoFromStructuredData(structuredData);
    const companyInfoFromMeta = extractCompanyInfoFromMeta(pageContext.metaTags);

    const companyInfo: ScrapedCompanyInfo = {
      name: companyInfoFromStructured.name || companyInfoFromMeta.name,
      description: companyInfoFromStructured.description || companyInfoFromMeta.description,
      foundedYear: companyInfoFromStructured.foundedYear,
      website: url,
    };

    return {
      url,
      contact: {
        emails,
        phones,
        addresses,
        socialProfiles,
      },
      companyInfo,
      scrapedAt: new Date(),
    };
  }

  /**
   * hasEnoughData
   */
  private hasEnoughData(data: ScrapedData): boolean {
    const emailCount = data.contact.emails.length;
    const phoneCount = data.contact.phones.length;
    const addressCount = data.contact.addresses.length;

    const totalData = emailCount + phoneCount + addressCount;
    return totalData >= this.options.minDataThreshold;
  }

  /**
   * scrapeWithBrowser
   */
  private async scrapeWithBrowser(url: string): Promise<ScrapedData> {
    const scraper = new WebScraper({
      timeout: this.options.timeout,
      headless: true,
      followContactPage: this.options.followContactPage,
      followAboutPage: this.options.followAboutPage,
      includeHtml: this.options.includeHtml,
      context: this.options.context,
    });

    try {
      await scraper.initialize();
      const result = await scraper.scrape(url);

      const cache = getScraperCache();
      await cache.set(url, result);

      return result;
    } finally {
      await Promise.race([
        scraper.close(),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]).catch((error) => {
        logger.error({ error, url }, 'Failed to close scraper gracefully');
      });
    }
  }
}

/**
 * smartScrapeWebsite
 */
export async function smartScrapeWebsite(
  url: string,
  options?: SmartScraperOptions
): Promise<ScrapedData> {
  const scraper = new SmartScraper(options);
  return scraper.scrape(url);
}
