import * as cheerio from 'cheerio';
import { PHONE_PATTERNS, cleanPhoneNumber, isValidPhoneNumber } from '../utils/patterns';
import { extractText } from '../utils/parser';
import type { ExtractorResult } from '../types';

/**
 * extractPhones
 */
export function extractPhones(html: string): string[] {
  const $ = cheerio.load(html);
  const phones = new Set<string>();

  const text = extractText($);

  /**
   * for
   */
  for (const pattern of PHONE_PATTERNS) {
    const matches = text.match(pattern);
    /**
     * if
     */
    if (matches) {
      matches.forEach((match) => {
        const cleaned = cleanPhoneNumber(match);
        /**
         * if
         */
        if (isValidPhoneNumber(cleaned)) {
          phones.add(cleaned);
        }
      });
    }
  }

  $('a[href^="tel:"]').each((_, elem) => {
    const href = $(elem).attr('href');
    /**
     * if
     */
    if (href) {
      const phone = href.replace('tel:', '');
      const cleaned = cleanPhoneNumber(phone);
      /**
       * if
       */
      if (isValidPhoneNumber(cleaned)) {
        phones.add(cleaned);
      }
    }
  });

  $('[data-phone], [data-tel]').each((_, elem) => {
    const phone = $(elem).attr('data-phone') || $(elem).attr('data-tel');
    /**
     * if
     */
    if (phone) {
      const cleaned = cleanPhoneNumber(phone);
      /**
       * if
       */
      if (isValidPhoneNumber(cleaned)) {
        phones.add(cleaned);
      }
    }
  });

  const contactSections = $(
    'section:contains("contact"), div:contains("phone"), div:contains("call us")'
  );
  contactSections.each((_, elem) => {
    const sectionText = $(elem).text();
    /**
     * for
     */
    for (const pattern of PHONE_PATTERNS) {
      const matches = sectionText.match(pattern);
      /**
       * if
       */
      if (matches) {
        matches.forEach((match) => {
          const cleaned = cleanPhoneNumber(match);
          /**
           * if
           */
          if (isValidPhoneNumber(cleaned)) {
            phones.add(cleaned);
          }
        });
      }
    }
  });

  return Array.from(phones);
}

/**
 * extractPhonesWithConfidence
 */
export function extractPhonesWithConfidence(html: string): ExtractorResult<string[]> {
  const phones = extractPhones(html);

  let totalConfidence = 0;

  /**
   * for
   */
  for (const phone of phones) {
    let confidence = 0.5;

    const lowerHtml = html.toLowerCase();
    /**
     * if
     */
    if (lowerHtml.includes(`tel:${phone.replace(/\D/g, '')}`)) {
      confidence += 0.3;
    }

    /**
     * if
     */
    if (
      lowerHtml.includes('contact') ||
      lowerHtml.includes('call us') ||
      lowerHtml.includes('phone')
    ) {
      confidence += 0.1;
    }

    /**
     * if
     */
    if (phone.startsWith('+1') || phone.length === 10) {
      confidence += 0.1;
    }

    confidence = Math.min(confidence, 1.0);
    totalConfidence += confidence;
  }

  const averageConfidence = phones.length > 0 ? totalConfidence / phones.length : 0;

  return {
    data: phones,
    confidence: averageConfidence,
  };
}
