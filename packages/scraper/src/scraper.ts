import * as cheerio from 'cheerio';
import { StealthBrowser } from './stealth/browser';
import { extractEmails } from './extractors/email';
import { extractPhones } from './extractors/phone';
import { extractAddresses } from './extractors/address';
import { extractSocialProfiles } from './extractors/social';
import {
  parseHtml,
  extractLinks,
  findContactPage,
  extractStructuredData,
  extractCompanyInfoFromStructuredData,
  extractCompanyInfoFromMeta,
  randomDelay,
} from './utils/parser';
import { CONTACT_PAGE_PATTERNS, ABOUT_PAGE_PATTERNS, normalizeUrl } from './utils/patterns';
import type {
  ScrapedData,
  ScraperOptions,
  ScrapedContact,
  ScrapedCompanyInfo,
  PageContext,
} from './types';
import { logger } from '@repo/logger';
import { getScraperCache } from './cache/scraper-cache';

const DEFAULT_OPTIONS: Required<ScraperOptions> = {
  timeout: 30000,
  maxRetries: 2,
  minDelay: 500,
  maxDelay: 1500,
  userAgent: '',
  headless: true,
  followContactPage: true,
  followAboutPage: true,
  maxDepth: 2,
  context: 'MANUAL',
  includeHtml: false,
};

export class WebScraper {
  private browser: StealthBrowser | null = null;
  private options: Required<ScraperOptions>;
  private externalBrowser: boolean = false;

  /**
   * constructor
   */
  constructor(options: ScraperOptions = {}, browser?: StealthBrowser) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    /**
     * if
     */
    if (browser) {
      this.browser = browser;
      this.externalBrowser = true;
    }
  }

  /**
   * initialize
   */
  async initialize(): Promise<void> {
    /**
     * if
     */
    if (this.externalBrowser) {
      return;
    }
    this.browser = new StealthBrowser({
      headless: this.options.headless,
      timeout: this.options.timeout,
      userAgent: this.options.userAgent || undefined,
    });
    await this.browser.initialize();
  }

  /**
   * scrape
   */
  async scrape(url: string): Promise<ScrapedData> {
    /**
     * if
     */
    if (!this.browser) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

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

    logger.info(`${contextPrefix}Starting scrape: ${normalizedUrl}`);

    const mainPageData = await this.scrapePage(normalizedUrl);

    let allEmails = new Set<string>(mainPageData.contact.emails);
    let allPhones = new Set<string>(mainPageData.contact.phones);
    let allAddresses = new Set<string>(mainPageData.contact.addresses);
    let allSocialProfiles = [...mainPageData.contact.socialProfiles];

    let contactPageUrl: string | undefined;
    let aboutPageUrl: string | undefined;

    /**
     * if
     */
    if (this.options.followContactPage) {
      const $ = cheerio.load(mainPageData.html);
      const links = extractLinks($, normalizedUrl);
      contactPageUrl = findContactPage(links, CONTACT_PAGE_PATTERNS);

      /**
       * if
       */
      if (contactPageUrl && contactPageUrl !== normalizedUrl) {
        logger.info(`${contextPrefix}Found contact page: ${contactPageUrl}`);
        await randomDelay(this.options.minDelay, this.options.maxDelay);

        try {
          const contactData = await this.scrapePage(contactPageUrl);
          contactData.contact.emails.forEach((e) => allEmails.add(e));
          contactData.contact.phones.forEach((p) => allPhones.add(p));
          contactData.contact.addresses.forEach((a) => allAddresses.add(a));
          allSocialProfiles.push(...contactData.contact.socialProfiles);
        } catch (error) {
          logger.error(`Failed to scrape contact page: ${error}`);
        }
      }
    }

    /**
     * if
     */
    if (this.options.followAboutPage) {
      const $ = cheerio.load(mainPageData.html);
      const links = extractLinks($, normalizedUrl);
      aboutPageUrl = findContactPage(links, ABOUT_PAGE_PATTERNS);

      /**
       * if
       */
      if (aboutPageUrl && aboutPageUrl !== normalizedUrl && aboutPageUrl !== contactPageUrl) {
        logger.info(`${contextPrefix}Found about page: ${aboutPageUrl}`);
        await randomDelay(this.options.minDelay, this.options.maxDelay);

        try {
          const aboutData = await this.scrapePage(aboutPageUrl);
          /**
           * if
           */
          if (aboutData.companyInfo.description && !mainPageData.companyInfo.description) {
            mainPageData.companyInfo.description = aboutData.companyInfo.description;
          }
        } catch (error) {
          logger.error(`Failed to scrape about page: ${error}`);
        }
      }
    }

    const uniqueSocialProfiles = Array.from(
      new Map(allSocialProfiles.map((p) => [p.url, p])).values()
    );

    const result: ScrapedData = {
      url: normalizedUrl,
      contact: {
        emails: Array.from(allEmails),
        phones: Array.from(allPhones),
        addresses: Array.from(allAddresses),
        socialProfiles: uniqueSocialProfiles,
      },
      companyInfo: mainPageData.companyInfo,
      contactPageUrl,
      aboutPageUrl,
      scrapedAt: new Date(),
      ...(this.options.includeHtml && { html: mainPageData.html }),
    };

    logger.info(
      `${contextPrefix}Scrape completed: ${normalizedUrl} (${result.contact.emails.length} emails, ${result.contact.phones.length} phones)`
    );

    await cache.set(normalizedUrl, result);

    return result;
  }

  /**
   * scrapePage
   */
  private async scrapePage(url: string): Promise<{
    html: string;
    contact: ScrapedContact;
    companyInfo: ScrapedCompanyInfo;
  }> {
    /**
     * if
     */
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page = await this.browser.newPage();
    let pageClosed = false;

    /**
     * forceClosePage
     */
    const forceClosePage = async () => {
      /**
       * if
       */
      if (pageClosed) return;
      try {
        await Promise.race([
          page.close({ runBeforeUnload: false }),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
        pageClosed = true;
      } catch (error) {
        logger.error({ error, url }, 'Failed to force close page');
      }
    };

    try {
      const success = await this.browser.navigateWithRetry(page, url, this.options.maxRetries);

      /**
       * if
       */
      if (!success) {
        throw new Error(`Failed to load page: ${url}`);
      }

      await randomDelay(500, 1000);

      const html = await page.content();

      const pageContext = parseHtml(html, url);

      const emails = extractEmails(html);
      const phones = extractPhones(html);
      const addresses = extractAddresses(html);
      const socialProfiles = extractSocialProfiles(html);

      const $ = cheerio.load(html);
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
        html,
        contact: {
          emails,
          phones,
          addresses,
          socialProfiles,
        },
        companyInfo,
      };
    } finally {
      await forceClosePage();
    }
  }

  /**
   * close
   */
  async close(): Promise<void> {
    /**
     * if
     */
    if (this.browser && !this.externalBrowser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * scrapeMultiple
   */
  async scrapeMultiple(urls: string[]): Promise<Map<string, ScrapedData>> {
    const results = new Map<string, ScrapedData>();

    /**
     * for
     */
    for (const url of urls) {
      try {
        const data = await this.scrape(url);
        results.set(url, data);

        /**
         * if
         */
        if (urls.indexOf(url) < urls.length - 1) {
          await randomDelay(this.options.minDelay, this.options.maxDelay);
        }
      } catch (error) {
        logger.error({ url, error }, 'Failed to scrape website');
      }
    }

    return results;
  }
}

/**
 * scrapeWebsite
 */
export async function scrapeWebsite(url: string, options?: ScraperOptions): Promise<ScrapedData> {
  const scraper = new WebScraper(options);

  try {
    await scraper.initialize();
    return await scraper.scrape(url);
  } finally {
    await scraper.close();
  }
}

/**
 * scrapeWebsites
 */
export async function scrapeWebsites(
  urls: string[],
  options?: ScraperOptions
): Promise<Map<string, ScrapedData>> {
  const scraper = new WebScraper(options);

  try {
    await scraper.initialize();
    return await scraper.scrapeMultiple(urls);
  } finally {
    await scraper.close();
  }
}
