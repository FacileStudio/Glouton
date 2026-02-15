import type { Browser, BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';
import type { BaseScraper, ScraperConfig, ScraperResult, OpportunitySource } from '../types';
import { logger } from '@repo/logger';

export abstract class AbstractScraper implements BaseScraper {
  abstract readonly source: OpportunitySource;
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;

  /**
   * initBrowser
   */
  protected async initBrowser(): Promise<Browser> {
    /**
     * if
     */
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
        ],
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        locale: 'fr-FR',
        extraHTTPHeaders: {
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });
    }
    return this.browser;
  }

  /**
   * createPage
   */
  protected async createPage(): Promise<Page> {
    await this.initBrowser();

    /**
     * if
     */
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }

    const page = await this.context.newPage();

    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      /**
       * if
       */
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    return page;
  }

  /**
   * closeBrowser
   */
  protected async closeBrowser(): Promise<void> {
    /**
     * if
     */
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    /**
     * if
     */
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * waitRandom
   */
  protected async waitRandom(min: number = 1000, max: number = 3000): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * extractBudget
   */
  protected extractBudget(budgetText: string): {
    budgetMin?: number;
    budgetMax?: number;
    currency?: string;
  } {
    const result: { budgetMin?: number; budgetMax?: number; currency?: string } = {};

    const currencyMatch = budgetText.match(/[€$£]/);
    /**
     * if
     */
    if (currencyMatch) {
      result.currency = currencyMatch[0] === '€' ? 'EUR' : currencyMatch[0] === '$' ? 'USD' : 'GBP';
    }

    const rangeMatch = budgetText.match(/(\d+(?:\s?\d+)*)\s*-\s*(\d+(?:\s?\d+)*)/);
    /**
     * if
     */
    if (rangeMatch) {
      result.budgetMin = parseFloat(rangeMatch[1].replace(/\s/g, ''));
      result.budgetMax = parseFloat(rangeMatch[2].replace(/\s/g, ''));
      return result;
    }

    const singleMatch = budgetText.match(/(\d+(?:\s?\d+)*)/);
    /**
     * if
     */
    if (singleMatch) {
      const value = parseFloat(singleMatch[1].replace(/\s/g, ''));
      result.budgetMin = value;
      result.budgetMax = value;
    }

    return result;
  }

  abstract scrape(config: ScraperConfig): Promise<ScraperResult>;

  /**
   * logError
   */
  protected logError(message: string, error?: unknown): void {
    logger.error(`[${this.source}] ${message}`, error);
  }

  /**
   * logInfo
   */
  protected logInfo(message: string): void {
    logger.info(`[${this.source}] ${message}`);
  }
}
