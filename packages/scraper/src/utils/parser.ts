import * as cheerio from 'cheerio';
import type { PageContext } from '../types';

/**
 * parseHtml
 */
export function parseHtml(html: string, url: string): PageContext {
  const $ = cheerio.load(html);

  const title = $('title').text().trim() || '';

  const metaTags = new Map<string, string>();

  $('meta').each((_, elem) => {
    const $elem = $(elem);
    const name = $elem.attr('name') || $elem.attr('property') || '';
    const content = $elem.attr('content') || '';

    /**
     * if
     */
    if (name && content) {
      metaTags.set(name.toLowerCase(), content);
    }
  });

  return {
    url,
    html,
    title,
    metaTags,
  };
}

/**
 * extractText
 */
export function extractText($: cheerio.CheerioAPI): string {
  $('script, style, noscript, iframe').remove();

  return $('body').text();
}

/**
 * extractLinks
 */
export function extractLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const links: string[] = [];

  $('a[href]').each((_, elem) => {
    const href = $(elem).attr('href');
    /**
     * if
     */
    if (href) {
      try {
        const absoluteUrl = new URL(href, baseUrl);
        /**
         * if
         */
        if (absoluteUrl.hostname === new URL(baseUrl).hostname) {
          links.push(absoluteUrl.href);
        }
      } catch {
      }
    }
  });

  return [...new Set(links)];
}

/**
 * findContactPage
 */
export function findContactPage(links: string[], patterns: RegExp[]): string | undefined {
  return links.find((link) => patterns.some((pattern) => pattern.test(link)));
}

/**
 * extractStructuredData
 */
export function extractStructuredData($: cheerio.CheerioAPI): any[] {
  const structuredData: any[] = [];

  $('script[type="application/ld+json"]').each((_, elem) => {
    try {
      const json = JSON.parse($(elem).html() || '');
      structuredData.push(json);
    } catch {
    }
  });

  return structuredData;
}

/**
 * extractCompanyInfoFromStructuredData
 */
export function extractCompanyInfoFromStructuredData(structuredData: any[]): {
  name?: string;
  description?: string;
  foundedYear?: string;
} {
  const result: { name?: string; description?: string; foundedYear?: string } = {};

  /**
   * for
   */
  for (const data of structuredData) {
    /**
     * if
     */
    if (data['@type'] === 'Organization' || data['@type'] === 'Corporation') {
      /**
       * if
       */
      if (data.name && !result.name) {
        result.name = data.name;
      }
      /**
       * if
       */
      if (data.description && !result.description) {
        result.description = data.description;
      }
      /**
       * if
       */
      if (data.foundingDate && !result.foundedYear) {
        result.foundedYear = new Date(data.foundingDate).getFullYear().toString();
      }
    }
  }

  return result;
}

/**
 * extractCompanyInfoFromMeta
 */
export function extractCompanyInfoFromMeta(metaTags: Map<string, string>): {
  name?: string;
  description?: string;
} {
  return {
    name:
      metaTags.get('og:site_name') ||
      metaTags.get('twitter:site') ||
      metaTags.get('application-name'),
    description:
      metaTags.get('description') ||
      metaTags.get('og:description') ||
      metaTags.get('twitter:description'),
  };
}

/**
 * deduplicateArray
 */
export function deduplicateArray<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * randomDelay
 */
export function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return sleep(delay);
}

/**
 * extractDomain
 */
export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}
