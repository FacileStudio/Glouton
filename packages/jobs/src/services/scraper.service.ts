import { load, CheerioAPI } from 'cheerio';

export interface AuditResult {
  title: string;
  description: string;
  emails: string[];
  phones: string[];
  socials: {
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    twitter?: string;
  };
  technologies: string[];
  hasSsl: boolean;
}

interface ScraperOptions {
  maxRetries?: number;
  timeoutMs?: number;
  maxEmailsPerDomain?: number;
  maxPhonesPerDomain?: number;
}

export class ScraperService {
  private readonly emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  private readonly phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  private readonly domainCache = new Map<string, AuditResult | null>();
  private readonly cacheTTL = 5 * 60 * 1000;
  private readonly cacheTimestamps = new Map<string, number>();

  private readonly options: Required<ScraperOptions> = {
    maxRetries: 2,
    timeoutMs: 10000,
    maxEmailsPerDomain: 5,
    maxPhonesPerDomain: 5,
  };

  constructor(options?: ScraperOptions) {
    if (options) {
      this.options = { ...this.options, ...options };
    }
  }

  async auditDomain(domain: string): Promise<AuditResult | null> {
    const normalizedDomain = this.normalizeDomain(domain);

    const cached = this.getCached(normalizedDomain);
    if (cached !== undefined) {
      return cached;
    }

    const result = await this.auditWithRetry(normalizedDomain);
    this.setCached(normalizedDomain, result);
    return result;
  }

  private async auditWithRetry(domain: string): Promise<AuditResult | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        const result = await this.performAudit(domain);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(
          `[SCRAPER] Attempt ${attempt + 1}/${this.options.maxRetries + 1} failed for ${domain}: ${lastError.message}`
        );

        if (attempt < this.options.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    console.error(`[SCRAPER] All retry attempts exhausted for ${domain}`);
    return null;
  }

  private async performAudit(domain: string): Promise<AuditResult | null> {
    const urls = this.getUrlVariants(domain);
    let lastResponse: Response | null = null;
    let successUrl: string | null = null;

    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Cache-Control': 'no-cache',
            },
            signal: controller.signal,
            redirect: 'follow',
          });

          clearTimeout(timeout);

          if (response.ok) {
            lastResponse = response;
            successUrl = url;
            break;
          }
        } catch (fetchError) {
          clearTimeout(timeout);
          if ((fetchError as any)?.name === 'AbortError') {
            throw new Error(`Request timeout after ${this.options.timeoutMs}ms`);
          }
          throw fetchError;
        }
      } catch (error) {
        continue;
      }
    }

    if (!lastResponse || !successUrl) {
      return null;
    }

    const html = await lastResponse.text();
    const $ = load(html);

    const result: AuditResult = {
      title: this.extractTitle($),
      description: this.extractDescription($),
      emails: this.extractEmails(html),
      phones: this.extractPhones(html),
      socials: this.extractSocials($),
      technologies: this.detectTechnologies(html, $),
      hasSsl: successUrl.startsWith('https'),
    };

    return result;
  }

  private normalizeDomain(domain: string): string {
    return domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  }

  private getUrlVariants(domain: string): string[] {
    const normalizedDomain = this.normalizeDomain(domain);
    return [
      `https://${normalizedDomain}`,
      `https://www.${normalizedDomain}`,
      `http://${normalizedDomain}`,
      `http://www.${normalizedDomain}`,
    ];
  }

  private extractTitle($: CheerioAPI): string {
    return $('title').first().text().trim().substring(0, 200);
  }

  private extractDescription($: CheerioAPI): string {
    return (
      $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      ''
    ).substring(0, 500);
  }

  private extractEmails(html: string): string[] {
    const matches = html.match(this.emailRegex) || [];
    const emails = Array.from(new Set(matches.map(m => m.toLowerCase())))
      .filter(email => !email.includes('@example.') && !email.includes('noreply'))
      .slice(0, this.options.maxEmailsPerDomain);
    return emails;
  }

  private extractPhones(html: string): string[] {
    const matches = html.match(this.phoneRegex) || [];
    const phones = Array.from(new Set(matches))
      .filter(phone => phone.replace(/\D/g, '').length >= 10)
      .slice(0, this.options.maxPhonesPerDomain);
    return phones;
  }

  private extractSocials($: CheerioAPI): AuditResult['socials'] {
    const socials: AuditResult['socials'] = {};
    const processedUrls = new Set<string>();

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (processedUrls.has(href)) return;

      processedUrls.add(href);

      if (href.includes('facebook.com/') && !socials.facebook) {
        socials.facebook = href;
      }
      if (href.includes('instagram.com/') && !socials.instagram) {
        socials.instagram = href;
      }
      if (href.includes('linkedin.com/company/') && !socials.linkedin) {
        socials.linkedin = href;
      }
      if ((href.includes('twitter.com/') || href.includes('x.com/')) && !socials.twitter) {
        socials.twitter = href;
      }
    });

    return socials;
  }

  private detectTechnologies(html: string, $: CheerioAPI): string[] {
    const techs = new Set<string>();
    const htmlLower = html.toLowerCase();

    const techPatterns: Array<[string, string | (() => boolean)]> = [
      ['WordPress', 'wp-content'],
      ['Shopify', 'cdn.shopify.com'],
      ['Next.js', () => $('script[src*="/_next/"]').length > 0],
      ['React', () => html.includes('react') || html.includes('_jsx')],
      ['Vue.js', () => html.includes('vue') || $('[v-if], [v-for], [v-model]').length > 0],
      ['Angular', () => html.includes('ng-') || html.includes('angular')],
      ['Google Tag Manager', 'googletagmanager.com'],
      ['Google Analytics', () => htmlLower.includes('google-analytics.com') || htmlLower.includes('gtag(')],
      ['HubSpot', 'hubspot.com'],
      ['Webflow', 'webflow.com'],
      ['Wix', 'wix.com'],
      ['Squarespace', 'squarespace.com'],
      ['jQuery', () => $('script[src*="jquery"]').length > 0 || html.includes('jQuery')],
      ['Bootstrap', () => htmlLower.includes('bootstrap') || $('[class*="col-md"], [class*="btn-primary"]').length > 0],
      ['Tailwind CSS', () => $('[class*="flex "], [class*="grid "], [class*="p-"], [class*="m-"]').length > 5],
    ];

    for (const [tech, pattern] of techPatterns) {
      if (typeof pattern === 'string') {
        if (htmlLower.includes(pattern.toLowerCase())) {
          techs.add(tech);
        }
      } else if (pattern()) {
        techs.add(tech);
      }
    }

    return Array.from(techs);
  }

  private getCached(domain: string): AuditResult | null | undefined {
    const timestamp = this.cacheTimestamps.get(domain);
    if (!timestamp) return undefined;

    if (Date.now() - timestamp > this.cacheTTL) {
      this.domainCache.delete(domain);
      this.cacheTimestamps.delete(domain);
      return undefined;
    }

    return this.domainCache.get(domain);
  }

  private setCached(domain: string, result: AuditResult | null): void {
    this.domainCache.set(domain, result);
    this.cacheTimestamps.set(domain, Date.now());

    if (this.domainCache.size > 1000) {
      const oldestKey = Array.from(this.cacheTimestamps.entries())
        .sort((a, b) => a[1] - b[1])[0][0];
      this.domainCache.delete(oldestKey);
      this.cacheTimestamps.delete(oldestKey);
    }
  }

  clearCache(): void {
    this.domainCache.clear();
    this.cacheTimestamps.clear();
  }
}
