import { AbstractScraper } from './base';
import type { ScraperConfig, ScraperResult, ScrapedOpportunity } from '../types';
import { OpportunitySource, OpportunityCategory } from '../types';
import type { Page } from 'playwright';

export class WeWorkRemotelyScraper extends AbstractScraper {
  readonly source = OpportunitySource.WE_WORK_REMOTELY;
  private readonly baseUrl = 'https://weworkremotely.com';

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
          const categoryOpportunities = await this.scrapeCategory(page, category);
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
  private async scrapeCategory(page: Page, category: OpportunityCategory): Promise<ScrapedOpportunity[]> {
    const opportunities: ScrapedOpportunity[] = [];
    const categoryUrl = this.getCategoryUrl(category);

    try {
      await page.goto(categoryUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await this.waitRandom(1000, 2000);

      const pageOpportunities = await page.evaluate(() => {
        const items: Array<{
          title: string;
          company: string;
          url: string;
          location: string;
          postedAt: string;
        }> = [];

        const jobListings = document.querySelectorAll('li.feature, li[data-job-id], .job-listing');

        jobListings.forEach((listing) => {
          const titleEl = listing.querySelector('.title, h2, .job-title');
          const companyEl = listing.querySelector('.company, .company-name');
          const linkEl = listing.querySelector('a');
          const locationEl = listing.querySelector('.location, .region');
          const dateEl = listing.querySelector('time, .date');

          /**
           * if
           */
          if (titleEl && linkEl) {
            items.push({
              title: titleEl.textContent?.trim() || '',
              company: companyEl?.textContent?.trim() || '',
              url: linkEl.href.startsWith('http') ? linkEl.href : `https://weworkremotely.com${linkEl.getAttribute('href')}`,
              location: locationEl?.textContent?.trim() || 'Remote',
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
        const sourceId = this.extractJobId(item.url);
        /**
         * if
         */
        if (!sourceId) continue;

        const detailPage = await this.scrapeJobDetails(page, item.url);

        opportunities.push({
          sourceId: `wwr_${sourceId}`,
          title: item.title,
          description: detailPage?.description || item.title,
          company: item.company,
          sourceUrl: item.url,
          category,
          tags: this.extractTags(item.title + ' ' + (detailPage?.description || '')),
          location: item.location,
          isRemote: true,
          postedAt: this.parseDate(item.postedAt),
        });

        await this.waitRandom(500, 1500);
      }
    } catch (error) {
      this.logError(`Failed to scrape category ${category}`, error);
    }

    return opportunities;
  }

  /**
   * scrapeJobDetails
   */
  private async scrapeJobDetails(page: Page, url: string): Promise<{ description: string } | null> {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

      const description = await page.evaluate(() => {
        const descEl = document.querySelector('.listing-container, .job-description, #job-listing-show-container');
        return descEl?.textContent?.trim() || '';
      });

      return { description };
    } catch (error) {
      this.logError(`Failed to scrape job details from ${url}`, error);
      return null;
    }
  }

  /**
   * getCategoryUrl
   */
  private getCategoryUrl(category: OpportunityCategory): string {
    const categoryMap: Record<string, string> = {
      [OpportunityCategory.WEB_DEVELOPMENT]: `${this.baseUrl}/categories/remote-programming-jobs`,
      [OpportunityCategory.WEB_DESIGN]: `${this.baseUrl}/categories/remote-design-jobs`,
      [OpportunityCategory.FRONTEND]: `${this.baseUrl}/categories/remote-programming-jobs`,
      [OpportunityCategory.BACKEND]: `${this.baseUrl}/categories/remote-programming-jobs`,
      [OpportunityCategory.FULLSTACK]: `${this.baseUrl}/categories/remote-full-stack-programming-jobs`,
      [OpportunityCategory.DEVOPS]: `${this.baseUrl}/categories/remote-devops-sysadmin-jobs`,
    };

    return categoryMap[category] || `${this.baseUrl}/categories/remote-programming-jobs`;
  }

  /**
   * extractJobId
   */
  private extractJobId(url: string): string | null {
    const match = url.match(/\/(\d+)-/);
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

    try {
      return new Date(dateStr);
    } catch {
      return new Date();
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
      'typescript', 'javascript', 'python', 'php', 'java', 'ruby', 'go', 'rust',
      'wordpress', 'shopify', 'woocommerce',
      'figma', 'sketch', 'adobe xd',
      'tailwind', 'bootstrap', 'sass',
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
