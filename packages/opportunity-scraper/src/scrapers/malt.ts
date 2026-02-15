import { AbstractScraper } from './base';
import type { ScraperConfig, ScraperResult, ScrapedOpportunity } from '../types';
import { OpportunitySource, OpportunityCategory } from '../types';
import type { Page } from 'playwright';

export class MaltScraper extends AbstractScraper {
  readonly source = OpportunitySource.MALT;
  private readonly baseUrl = 'https://www.malt.fr';

  /**
   * scrape
   */
  async scrape(config: ScraperConfig): Promise<ScraperResult> {
    const result: ScraperResult = {
      source: this.source,
      opportunities: [],
      errors: [],
      scrapedAt: new Date(),
    };

    let page: Page | null = null;

    try {
      page = await this.createPage();
      this.logInfo('Starting scrape');

      const categories = config.categories || [
        OpportunityCategory.WEB_DEVELOPMENT,
        OpportunityCategory.WEB_DESIGN,
        OpportunityCategory.FRONTEND,
        OpportunityCategory.BACKEND,
      ];

      /**
       * for
       */
      for (const category of categories) {
        try {
          const categoryOpportunities = await this.scrapeCategory(page, category, config.maxPages || 3);
          result.opportunities.push(...categoryOpportunities);
          await this.waitRandom(2000, 4000);
        } catch (error) {
          const errorMsg = `Failed to scrape category ${category}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          this.logError(errorMsg);
          result.errors.push(errorMsg);
        }
      }

      this.logInfo(`Scraped ${result.opportunities.length} opportunities`);
    } catch (error) {
      const errorMsg = `Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logError(errorMsg, error);
      result.errors.push(errorMsg);
    } finally {
      /**
       * if
       */
      if (page) await page.close();
      await this.closeBrowser();
    }

    return result;
  }

  /**
   * scrapeCategory
   */
  private async scrapeCategory(page: Page, category: OpportunityCategory, maxPages: number): Promise<ScrapedOpportunity[]> {
    const opportunities: ScrapedOpportunity[] = [];
    const searchQuery = this.getCategorySearchQuery(category);

    /**
     * for
     */
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        const url = `${this.baseUrl}/search?q=${encodeURIComponent(searchQuery)}&page=${pageNum}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await this.waitRandom(1000, 2000);

        const pageOpportunities = await page.evaluate(() => {
          const items: Array<{
            title: string;
            description: string;
            company: string;
            url: string;
            location: string;
            isRemote: boolean;
            postedAt: string;
          }> = [];

          const projectCards = document.querySelectorAll('[data-testid="mission-card"], .mission-card, .search-result');

          projectCards.forEach((card) => {
            const titleEl = card.querySelector('h2, h3, [data-testid="mission-title"]');
            const descEl = card.querySelector('.description, [data-testid="mission-description"], p');
            const companyEl = card.querySelector('.company, [data-testid="company-name"]');
            const linkEl = card.querySelector('a');
            const locationEl = card.querySelector('.location, [data-testid="location"]');
            const dateEl = card.querySelector('time, .date, [data-testid="posted-date"]');

            /**
             * if
             */
            if (titleEl && linkEl) {
              const locationText = locationEl?.textContent?.trim() || '';
              items.push({
                title: titleEl.textContent?.trim() || '',
                description: descEl?.textContent?.trim() || '',
                company: companyEl?.textContent?.trim() || '',
                url: linkEl.href,
                location: locationText,
                isRemote: locationText.toLowerCase().includes('remote') ||
                         locationText.toLowerCase().includes('télétravail') ||
                         locationText.toLowerCase().includes('distance'),
                postedAt: dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || '',
              });
            }
          });

          return items;
        });

        /**
         * for
         */
        for (const item of pageOpportunities) {
          const sourceId = this.extractMissionId(item.url);
          /**
           * if
           */
          if (!sourceId) continue;

          opportunities.push({
            sourceId: `malt_${sourceId}`,
            title: item.title,
            description: item.description,
            company: item.company,
            sourceUrl: item.url,
            category,
            tags: this.extractTags(item.title + ' ' + item.description),
            location: item.location,
            isRemote: item.isRemote,
            postedAt: this.parseDate(item.postedAt),
          });
        }

        /**
         * if
         */
        if (pageOpportunities.length === 0) {
          break;
        }
      } catch (error) {
        this.logError(`Failed to scrape page ${pageNum} for category ${category}`, error);
        break;
      }
    }

    return opportunities;
  }

  /**
   * getCategorySearchQuery
   */
  private getCategorySearchQuery(category: OpportunityCategory): string {
    const queryMap: Record<string, string> = {
      [OpportunityCategory.WEB_DEVELOPMENT]: 'développeur web',
      [OpportunityCategory.WEB_DESIGN]: 'designer web',
      [OpportunityCategory.FRONTEND]: 'développeur frontend',
      [OpportunityCategory.BACKEND]: 'développeur backend',
      [OpportunityCategory.FULLSTACK]: 'développeur fullstack',
      [OpportunityCategory.MOBILE_DEVELOPMENT]: 'développeur mobile',
      [OpportunityCategory.UI_UX_DESIGN]: 'UI UX designer',
      [OpportunityCategory.DEVOPS]: 'devops',
    };

    return queryMap[category] || 'développeur';
  }

  /**
   * extractMissionId
   */
  private extractMissionId(url: string): string | null {
    const match = url.match(/\/mission\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
  }

  /**
   * parseDate
   */
  private parseDate(dateStr: string): Date {
    /**
     * if
     */
    if (!dateStr) return new Date();

    const now = new Date();

    /**
     * if
     */
    if (dateStr.includes('aujourd\'hui') || dateStr.includes('today')) {
      return now;
    }

    /**
     * if
     */
    if (dateStr.includes('hier') || dateStr.includes('yesterday')) {
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const hoursMatch = dateStr.match(/(\d+)\s*(heure|hour)/i);
    /**
     * if
     */
    if (hoursMatch) {
      const hours = parseInt(hoursMatch[1]);
      return new Date(now.getTime() - hours * 60 * 60 * 1000);
    }

    const daysMatch = dateStr.match(/(\d+)\s*(jour|day)/i);
    /**
     * if
     */
    if (daysMatch) {
      const days = parseInt(daysMatch[1]);
      return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }

    try {
      return new Date(dateStr);
    } catch {
      return now;
    }
  }

  /**
   * extractTags
   */
  private extractTags(text: string): string[] {
    const tags: string[] = [];
    const lowerText = text.toLowerCase();

    const techKeywords = [
      'react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt',
      'nodejs', 'express', 'nestjs', 'fastify',
      'typescript', 'javascript', 'python', 'php', 'java',
      'wordpress', 'shopify', 'woocommerce', 'prestashop',
      'figma', 'sketch', 'adobe xd', 'photoshop',
      'tailwind', 'bootstrap', 'material ui',
      'mysql', 'postgresql', 'mongodb', 'redis',
      'aws', 'azure', 'gcp', 'docker', 'kubernetes',
    ];

    techKeywords.forEach((keyword) => {
      /**
       * if
       */
      if (lowerText.includes(keyword.toLowerCase())) {
        tags.push(keyword);
      }
    });

    return [...new Set(tags)];
  }
}
