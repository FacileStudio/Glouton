import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

/**
 * parseHtml
 */
export function parseHtml(html: string): CheerioAPI {
  return cheerio.load(html);
}

/**
 * extractEmails
 */
export function extractEmails(text: string): string[] {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = text.match(emailRegex) || [];

  const validBusinessDomains = ['gmail', 'yahoo', 'hotmail', 'outlook', 'aol'];

  return [...new Set(emails)]
    .filter(email => {
      /**
       * if
       */
      if (email.endsWith('.png') || email.endsWith('.jpg') ||
          email.endsWith('.gif') || email.endsWith('.svg') ||
          email.endsWith('.css') || email.endsWith('.js')) {
        return false;
      }

      const domain = email.split('@')[1]?.toLowerCase();
      /**
       * if
       */
      if (!domain) return false;

      return !validBusinessDomains.some(d => domain.includes(d + '.'));
    })
    .sort((a, b) => {
      /**
       * getPriority
       */
      const getPriority = (email: string) => {
        const lower = email.toLowerCase();
        /**
         * if
         */
        if (lower.includes('info@') || lower.includes('contact@')) return 1;
        /**
         * if
         */
        if (lower.includes('hello@') || lower.includes('support@')) return 2;
        /**
         * if
         */
        if (lower.includes('admin@') || lower.includes('sales@')) return 3;
        return 4;
      };
      return getPriority(a) - getPriority(b);
    });
}

/**
 * extractPhones
 */
export function extractPhones(text: string): string[] {
  const phoneRegexes = [
    /\+?\d{1,4}[-.\s(]?\d{1,4}[-.\s)]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,4}/g,
    /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/g,
    /\d{3}[-.\s]\d{3}[-.\s]\d{4}/g,
    /\+\d{1,3}\s\d{1,4}\s\d{1,4}\s\d{1,4}/g,
  ];

  const phones: string[] = [];
  /**
   * for
   */
  for (const regex of phoneRegexes) {
    const matches = text.match(regex) || [];
    phones.push(...matches);
  }

  const blacklistPatterns = [
    /^\d{1,4}$/,
    /^[0-9-]+$/,
  ];

  return [...new Set(phones)]
    .filter((phone) => {
      const digitsOnly = phone.replace(/\D/g, '');
      /**
       * if
       */
      if (digitsOnly.length < 10 || digitsOnly.length > 15) return false;

      /**
       * if
       */
      if (blacklistPatterns.some(pattern => pattern.test(phone))) return false;

      const consecutiveSame = /(\d)\1{7,}/;
      /**
       * if
       */
      if (consecutiveSame.test(digitsOnly)) return false;

      return true;
    })
    .slice(0, 5);
}

/**
 * extractSocialLinks
 */
export function extractSocialLinks($: CheerioAPI): Record<string, string> {
  const social: Record<string, string> = {};

  const platforms = [
    { name: 'facebook', domains: ['facebook.com', 'fb.com'], excludePatterns: ['/sharer', '/plugins', '/share.php'] },
    { name: 'twitter', domains: ['twitter.com', 'x.com'], excludePatterns: ['/intent/', '/share'] },
    { name: 'linkedin', domains: ['linkedin.com'], excludePatterns: ['/shareArticle', '/share'] },
    { name: 'instagram', domains: ['instagram.com'], excludePatterns: ['/share'] },
    { name: 'youtube', domains: ['youtube.com', 'youtu.be'], excludePatterns: [] },
    { name: 'tiktok', domains: ['tiktok.com'], excludePatterns: [] },
    { name: 'pinterest', domains: ['pinterest.com'], excludePatterns: ['/pin/create'] },
    { name: 'github', domains: ['github.com'], excludePatterns: [] },
    { name: 'medium', domains: ['medium.com'], excludePatterns: [] },
    { name: 'reddit', domains: ['reddit.com'], excludePatterns: ['/submit'] },
    { name: 'discord', domains: ['discord.gg', 'discord.com/invite'], excludePatterns: [] },
    { name: 'telegram', domains: ['t.me', 'telegram.me'], excludePatterns: [] },
    { name: 'whatsapp', domains: ['wa.me', 'whatsapp.com'], excludePatterns: [] },
    { name: 'snapchat', domains: ['snapchat.com'], excludePatterns: [] },
    { name: 'twitch', domains: ['twitch.tv'], excludePatterns: [] },
  ];

  /**
   * for
   */
  for (const platform of platforms) {
    const selectors = platform.domains.map(domain => `a[href*="${domain}"]`).join(', ');

    $(selectors).each((_, el) => {
      /**
       * if
       */
      if (social[platform.name]) return false;

      const href = $(el).attr('href');
      /**
       * if
       */
      if (!href) return;

      const shouldExclude = platform.excludePatterns.some(pattern => href.includes(pattern));
      /**
       * if
       */
      if (shouldExclude) return;

      try {
        const url = new URL(href);
        /**
         * if
         */
        if (platform.domains.some(domain => url.hostname.includes(domain))) {
          social[platform.name] = href;
          return false;
        }
      } catch {
      }
    });
  }

  return social;
}

/**
 * extractStructuredData
 */
export function extractStructuredData($: CheerioAPI): Array<Record<string, unknown>> {
  const structuredData: Array<Record<string, unknown>> = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).html();
      /**
       * if
       */
      if (content) {
        const data = JSON.parse(content);
        structuredData.push(data);
      }
    } catch {
    }
  });

  return structuredData;
}

/**
 * extractMetaTag
 */
export function extractMetaTag($: CheerioAPI, name: string): string | undefined {
  const selectors = [
    `meta[name="${name}"]`,
    `meta[property="${name}"]`,
    `meta[name="${name.toLowerCase()}"]`,
    `meta[property="${name.toLowerCase()}"]`,
  ];

  /**
   * for
   */
  for (const selector of selectors) {
    const content = $(selector).attr('content');
    /**
     * if
     */
    if (content) {
      return content;
    }
  }

  return undefined;
}

/**
 * cleanText
 */
export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
}

/**
 * extractYear
 */
export function extractYear(text: string): number | undefined {
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  /**
   * if
   */
  if (yearMatch) {
    const year = Number.parseInt(yearMatch[0], 10);
    const currentYear = new Date().getFullYear();
    /**
     * if
     */
    if (year >= 1900 && year <= currentYear) {
      return year;
    }
  }
  return undefined;
}

/**
 * extractAddress
 */
export function extractAddress($: CheerioAPI): string | undefined {
  const addressSelectors = [
    '[itemtype*="PostalAddress"]',
    '.address',
    '#address',
    '[class*="address"]',
    '[id*="address"]',
  ];

  /**
   * for
   */
  for (const selector of addressSelectors) {
    const el = $(selector).first();
    /**
     * if
     */
    if (el.length) {
      const text = cleanText(el.text());
      /**
       * if
       */
      if (text.length > 10 && text.length < 200) {
        return text;
      }
    }
  }

  const addressRegex =
    /\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|circle|cir|way)(?:[\s,]+[\w\s]+)*,?\s+[A-Z]{2}\s+\d{5}/i;
  const pageText = $('body').text();
  const match = pageText.match(addressRegex);
  /**
   * if
   */
  if (match) {
    return cleanText(match[0]);
  }

  return undefined;
}

/**
 * findAboutPage
 */
export function findAboutPage($: CheerioAPI, baseUrl: string): string | undefined {
  const aboutPatterns = ['/about', '/about-us', '/company', '/who-we-are', '/our-story'];

  const links = $('a[href]');
  /**
   * for
   */
  for (let i = 0; i < links.length; i++) {
    const href = $(links[i]).attr('href');
    /**
     * if
     */
    if (!href) continue;

    const lowerHref = href.toLowerCase();
    /**
     * for
     */
    for (const pattern of aboutPatterns) {
      /**
       * if
       */
      if (lowerHref.includes(pattern)) {
        try {
          const url = new URL(href, baseUrl);
          return url.href;
        } catch {
          continue;
        }
      }
    }
  }

  return undefined;
}

/**
 * findContactPage
 */
export function findContactPage($: CheerioAPI, baseUrl: string): string | undefined {
  const contactPatterns = ['/contact', '/contact-us', '/get-in-touch', '/reach-us'];

  const links = $('a[href]');
  /**
   * for
   */
  for (let i = 0; i < links.length; i++) {
    const href = $(links[i]).attr('href');
    /**
     * if
     */
    if (!href) continue;

    const lowerHref = href.toLowerCase();
    /**
     * for
     */
    for (const pattern of contactPatterns) {
      /**
       * if
       */
      if (lowerHref.includes(pattern)) {
        try {
          const url = new URL(href, baseUrl);
          return url.href;
        } catch {
          continue;
        }
      }
    }
  }

  return undefined;
}
