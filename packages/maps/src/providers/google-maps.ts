import { StealthBrowser } from '../stealth-browser';
import type { Page } from 'playwright';
import type {
  LocalBusiness,
  GoogleMapsScraperOptions,
  SearchOptions,
  BoundingBox,
} from '../types';
import { getGoogleMapsSearchQuery } from '../queries/categories';
import { cityToBoundingBox, coordinatesToBoundingBox } from '../utils/geocoding';

const DEFAULT_OPTIONS: GoogleMapsScraperOptions = {
  headless: true,
  timeout: 30000,
  maxResults: 100,
  delayBetweenScrolls: 2000,
  delayAfterSearch: 3000,
};

export class GoogleMapsScraper {
  private browser: StealthBrowser;
  private options: GoogleMapsScraperOptions;

  constructor(options: Partial<GoogleMapsScraperOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.browser = new StealthBrowser({
      headless: this.options.headless,
      timeout: this.options.timeout,
    });
  }

  async initialize(): Promise<void> {
    await this.browser.initialize();
  }

  async close(): Promise<void> {
    await this.browser.close();
  }

  async search(searchOptions: SearchOptions): Promise<LocalBusiness[]> {
    const page = await this.browser.newPage();

    try {
      const searchQuery = this.buildSearchQuery(searchOptions);

      const success = await this.browser.navigateWithRetry(
        page,
        `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`
      );

      if (!success) {
        throw new Error('Failed to load Google Maps search results');
      }

      await this.waitForSearchResults(page);

      const businesses = await this.extractBusinesses(page);

      if (searchOptions.hasWebsite !== undefined) {
        return businesses.filter((b) => b.hasWebsite === searchOptions.hasWebsite);
      }

      return businesses;
    } finally {
      await page.close();
    }
  }

  private buildSearchQuery(options: SearchOptions): string {
    let query = '';

    if (options.query) {
      query = options.query;
    } else if (options.category) {
      query = getGoogleMapsSearchQuery(options.category);
    } else {
      query = 'business';
    }

    if (options.location) {
      if (typeof options.location === 'string') {
        query += ` in ${options.location}`;
      } else if ('lat' in options.location) {
        query += ` near ${options.location.lat},${options.location.lng}`;
      }
    }

    return query;
  }

  private async waitForSearchResults(page: Page): Promise<void> {
    await page.waitForTimeout(this.options.delayAfterSearch || 3000);

    const selectors = [
      'div[role="feed"]',
      'div[role="main"]',
      'div.m6QErb',
      '[aria-label*="Results"]',
    ];

    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        return;
      } catch {
        continue;
      }
    }
  }

  private async scrollResults(page: Page): Promise<void> {
    const feedSelector = 'div[role="feed"]';

    try {
      await page.waitForSelector(feedSelector, { timeout: 5000 });
    } catch {
      return;
    }

    let previousHeight = 0;
    let unchangedCount = 0;
    const maxUnchanged = 3;

    while (unchangedCount < maxUnchanged) {
      const currentHeight = await page.evaluate((selector) => {
        const feed = document.querySelector(selector);
        if (feed) {
          feed.scrollTop = feed.scrollHeight;
          return feed.scrollHeight;
        }
        return 0;
      }, feedSelector);

      await page.waitForTimeout(this.options.delayBetweenScrolls || 2000);

      if (currentHeight === previousHeight) {
        unchangedCount++;
      } else {
        unchangedCount = 0;
      }

      previousHeight = currentHeight;

      const itemCount = await page.locator('div[role="feed"] > div').count();
      if (itemCount >= (this.options.maxResults || 100)) {
        break;
      }
    }
  }

  private async extractBusinesses(page: Page): Promise<LocalBusiness[]> {
    await this.scrollResults(page);

    const businesses = await page.evaluate((maxResults) => {
      const results: LocalBusiness[] = [];
      const items = document.querySelectorAll('div[role="feed"] > div > div > a');

      for (let i = 0; i < Math.min(items.length, maxResults); i++) {
        const item = items[i];
        const parent = item.closest('div[role="feed"] > div > div');

        if (!parent) continue;

        const nameElement = parent.querySelector('div.fontHeadlineSmall');
        const name = nameElement?.textContent?.trim();

        if (!name) continue;

        const ratingElement = parent.querySelector('span[role="img"]');
        const ratingText = ratingElement?.getAttribute('aria-label') || '';
        const ratingMatch = ratingText.match(/(\d+\.?\d*)\s*stars?/i);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;

        const reviewElement = parent.querySelector('span[role="img"] ~ span');
        const reviewText = reviewElement?.textContent || '';
        const reviewMatch = reviewText.match(/(\d+)/);
        const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : undefined;

        const addressElement = parent.querySelector('div.fontBodyMedium > div:nth-child(2)');
        const addressParts = addressElement?.textContent?.trim().split('·') || [];
        const address = addressParts.length > 1 ? addressParts[1]?.trim() : undefined;

        const category = addressParts.length > 0 ? addressParts[0]?.trim() : undefined;

        const href = item.getAttribute('href') || '';
        const coordsMatch = href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        const coordinates = coordsMatch
          ? { lat: parseFloat(coordsMatch[1]), lng: parseFloat(coordsMatch[2]) }
          : undefined;

        const websiteElement = parent.querySelector('a[href*="http"]');
        let website: string | undefined;
        let hasWebsite = false;

        if (websiteElement) {
          const href = websiteElement.getAttribute('href') || '';
          if (!href.includes('google.com') && !href.includes('gstatic.com')) {
            website = href;
            hasWebsite = true;
          }
        }

        results.push({
          source: 'google-maps',
          name,
          address,
          rating,
          reviewCount,
          category,
          coordinates,
          website,
          hasWebsite,
        });
      }

      return results;
    }, this.options.maxResults || 100);

    return businesses;
  }

  async searchDetailed(searchOptions: SearchOptions): Promise<LocalBusiness[]> {
    const businesses = await this.search(searchOptions);
    const detailedBusinesses: LocalBusiness[] = [];

    const page = await this.browser.newPage();

    try {
      for (const business of businesses.slice(0, this.options.maxResults || 100)) {
        try {
          const detailed = await this.extractDetailedBusiness(page, business);
          detailedBusinesses.push(detailed);

          await page.waitForTimeout(1000 + Math.random() * 2000);
        } catch (error) {
          detailedBusinesses.push(business);
        }
      }
    } finally {
      await page.close();
    }

    return detailedBusinesses;
  }

  private async extractDetailedBusiness(
    page: Page,
    business: LocalBusiness
  ): Promise<LocalBusiness> {
    if (!business.coordinates) {
      return business;
    }

    const url = `https://www.google.com/maps/place/${encodeURIComponent(business.name)}/@${business.coordinates.lat},${business.coordinates.lng},15z`;

    const success = await this.browser.navigateWithRetry(page, url);

    if (!success) {
      return business;
    }

    await page.waitForTimeout(2000);

    const details = await page.evaluate(() => {
      const phoneElement = document.querySelector('button[data-item-id*="phone"]');
      const phone = phoneElement?.textContent?.trim();

      const websiteElement = document.querySelector('a[data-item-id*="authority"]');
      const website = websiteElement?.getAttribute('href') || undefined;

      const hoursElement = document.querySelector('div[aria-label*="Hours"]');
      const openingHours = hoursElement?.textContent?.trim();

      const addressElement = document.querySelector('button[data-item-id*="address"]');
      const fullAddress = addressElement?.textContent?.trim();

      return { phone, website, openingHours, fullAddress };
    });

    return {
      ...business,
      phone: details.phone || business.phone,
      website: details.website || business.website,
      hasWebsite: Boolean(details.website || business.website),
      openingHours: details.openingHours || business.openingHours,
      address: details.fullAddress || business.address,
    };
  }
}

export async function searchGoogleMaps(
  options: SearchOptions,
  scraperOptions?: Partial<GoogleMapsScraperOptions>
): Promise<LocalBusiness[]> {
  const scraper = new GoogleMapsScraper(scraperOptions);

  try {
    await scraper.initialize();
    return await scraper.search(options);
  } finally {
    await scraper.close();
  }
}

export async function searchGoogleMapsDetailed(
  options: SearchOptions,
  scraperOptions?: Partial<GoogleMapsScraperOptions>
): Promise<LocalBusiness[]> {
  const scraper = new GoogleMapsScraper(scraperOptions);

  try {
    await scraper.initialize();
    return await scraper.searchDetailed(options);
  } finally {
    await scraper.close();
  }
}
