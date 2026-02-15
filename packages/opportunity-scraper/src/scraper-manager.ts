import type { BaseScraper, ScraperConfig, ScraperResult, OpportunitySource } from './types';
import { CodeurScraper } from './scrapers/codeur';
import { MaltScraper } from './scrapers/malt';
import { WeWorkRemotelyScraper } from './scrapers/weworkremotely';
import { logger } from '@repo/logger';

export class ScraperManager {
  private scrapers: Map<OpportunitySource, BaseScraper> = new Map();

  /**
   * constructor
   */
  constructor() {
    this.registerScraper(new CodeurScraper());
    this.registerScraper(new MaltScraper());
    this.registerScraper(new WeWorkRemotelyScraper());
  }

  /**
   * registerScraper
   */
  private registerScraper(scraper: BaseScraper): void {
    this.scrapers.set(scraper.source, scraper);
    logger.info(`Registered scraper: ${scraper.source}`);
  }

  /**
   * scrapeSource
   */
  async scrapeSource(config: ScraperConfig): Promise<ScraperResult> {
    const scraper = this.scrapers.get(config.source);

    /**
     * if
     */
    if (!scraper) {
      return {
        source: config.source,
        opportunities: [],
        errors: [`Scraper not found for source: ${config.source}`],
        scrapedAt: new Date(),
      };
    }

    logger.info(`Starting scrape for ${config.source}`);
    return await scraper.scrape(config);
  }

  /**
   * scrapeAll
   */
  async scrapeAll(configs: ScraperConfig[]): Promise<ScraperResult[]> {
    const enabledConfigs = configs.filter((config) => config.enabled);

    logger.info(`Scraping ${enabledConfigs.length} sources`);

    const results = await Promise.allSettled(
      enabledConfigs.map((config) => this.scrapeSource(config))
    );

    return results.map((result, index) => {
      /**
       * if
       */
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          source: enabledConfigs[index].source,
          opportunities: [],
          errors: [`Scraper crashed: ${result.reason}`],
          scrapedAt: new Date(),
        };
      }
    });
  }

  /**
   * getAvailableSources
   */
  getAvailableSources(): OpportunitySource[] {
    return Array.from(this.scrapers.keys());
  }

  /**
   * hasSource
   */
  hasSource(source: OpportunitySource): boolean {
    return this.scrapers.has(source);
  }
}
