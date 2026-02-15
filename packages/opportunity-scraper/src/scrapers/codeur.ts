import { AbstractScraper } from './base';
import type { ScraperConfig, ScraperResult, ScrapedOpportunity } from '../types';
import { OpportunitySource, OpportunityCategory } from '../types';
import type { Page } from 'playwright';

export class CodeurScraper extends AbstractScraper {
  readonly source = OpportunitySource.CODEUR;
  private readonly baseUrl = 'https://www.codeur.com';

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
    const categoryUrl = this.getCategoryUrl(category);

    /**
     * for
     */
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        const url = `${categoryUrl}?page=${pageNum}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await this.waitRandom(1000, 2000);

        const pageOpportunities = await page.evaluate(() => {
          const items: Array<{
            title: string;
            description: string;
            url: string;
            budget: string;
            postedAt: string;
            isRemote: boolean;
          }> = [];

          const projectCards = document.querySelectorAll('.project-item, .mission-card, [data-project-id]');

          projectCards.forEach((card) => {
            const titleEl = card.querySelector('.project-title, .mission-title, h3');
            const descEl = card.querySelector('.project-description, .mission-description, .description');
            const linkEl = card.querySelector('a[href*="/projects/"], a[href*="/mission/"]');
            const budgetEl = card.querySelector('.budget, .price, [class*="budget"]');
            const dateEl = card.querySelector('.date, .posted-date, time');
            const locationEl = card.querySelector('.location, [class*="location"]');

            /**
             * if
             */
            if (titleEl && linkEl) {
              items.push({
                title: titleEl.textContent?.trim() || '',
                description: descEl?.textContent?.trim() || '',
                url: (linkEl as HTMLAnchorElement).href,
                budget: budgetEl?.textContent?.trim() || '',
                postedAt: dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || '',
                isRemote: locationEl?.textContent?.toLowerCase().includes('distance') ||
                         locationEl?.textContent?.toLowerCase().includes('remote') || false,
              });
            }
          });

          return items;
        });

        /**
         * for
         */
        for (const item of pageOpportunities) {
          const sourceId = this.extractProjectId(item.url);
          /**
           * if
           */
          if (!sourceId) continue;

          const budgetInfo = this.extractBudget(item.budget);
          const postedAt = this.parseDate(item.postedAt);

          opportunities.push({
            sourceId: `codeur_${sourceId}`,
            title: item.title,
            description: item.description,
            sourceUrl: item.url,
            category,
            tags: this.extractTags(item.title + ' ' + item.description),
            budget: item.budget,
            ...budgetInfo,
            isRemote: item.isRemote,
            postedAt,
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
   * getCategoryUrl
   */
  private getCategoryUrl(category: OpportunityCategory): string {
    const categoryMap: Record<string, string> = {
      [OpportunityCategory.WEB_DEVELOPMENT]: `${this.baseUrl}/projects?category=developpement-web`,
      [OpportunityCategory.WEB_DESIGN]: `${this.baseUrl}/projects?category=design-web`,
      [OpportunityCategory.FRONTEND]: `${this.baseUrl}/projects?category=front-end`,
      [OpportunityCategory.BACKEND]: `${this.baseUrl}/projects?category=back-end`,
      [OpportunityCategory.MOBILE_DEVELOPMENT]: `${this.baseUrl}/projects?category=mobile`,
      [OpportunityCategory.WORDPRESS]: `${this.baseUrl}/projects?category=wordpress`,
    };

    return categoryMap[category] || `${this.baseUrl}/projects`;
  }

  /**
   * extractProjectId
   */
  private extractProjectId(url: string): string | null {
    const match = url.match(/\/projects\/(\d+)/);
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
