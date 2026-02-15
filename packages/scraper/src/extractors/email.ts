import * as cheerio from 'cheerio';
import {
  EMAIL_PATTERNS,
  cleanEmail,
  isValidEmail,
  EMAIL_OBFUSCATION_PATTERNS,
} from '../utils/patterns';
import { extractText } from '../utils/parser';
import type { ExtractorResult } from '../types';

/**
 * extractEmails
 */
export function extractEmails(html: string): string[] {
  const $ = cheerio.load(html);
  const emails = new Set<string>();

  const text = extractText($);

  /**
   * for
   */
  for (const pattern of EMAIL_PATTERNS) {
    const matches = text.match(pattern);
    /**
     * if
     */
    if (matches) {
      matches.forEach((match) => {
        const cleaned = cleanEmail(match);
        /**
         * if
         */
        if (isValidEmail(cleaned)) {
          emails.add(cleaned);
        }
      });
    }
  }

  $('a[href^="mailto:"]').each((_, elem) => {
    const href = $(elem).attr('href');
    /**
     * if
     */
    if (href) {
      const email = href.replace('mailto:', '').split('?')[0];
      const cleaned = cleanEmail(email);
      /**
       * if
       */
      if (isValidEmail(cleaned)) {
        emails.add(cleaned);
      }
    }
  });

  $('[data-email]').each((_, elem) => {
    const email = $(elem).attr('data-email');
    /**
     * if
     */
    if (email) {
      const cleaned = cleanEmail(email);
      /**
       * if
       */
      if (isValidEmail(cleaned)) {
        emails.add(cleaned);
      }
    }
  });

  const obfuscatedText = deobfuscateText(text);
  /**
   * for
   */
  for (const pattern of EMAIL_PATTERNS) {
    const matches = obfuscatedText.match(pattern);
    /**
     * if
     */
    if (matches) {
      matches.forEach((match) => {
        const cleaned = cleanEmail(match);
        /**
         * if
         */
        if (isValidEmail(cleaned)) {
          emails.add(cleaned);
        }
      });
    }
  }

  return Array.from(emails);
}

/**
 * deobfuscateText
 */
function deobfuscateText(text: string): string {
  let deobfuscated = text;

  /**
   * for
   */
  for (const { pattern, replacement } of EMAIL_OBFUSCATION_PATTERNS) {
    deobfuscated = deobfuscated.replace(pattern, replacement);
  }

  return deobfuscated;
}

/**
 * extractEmailsWithConfidence
 */
export function extractEmailsWithConfidence(html: string): ExtractorResult<string[]> {
  const emails = extractEmails(html);

  let totalConfidence = 0;
  const emailConfidences: number[] = [];

  /**
   * for
   */
  for (const email of emails) {
    let confidence = 0.5;

    const lowerHtml = html.toLowerCase();
    /**
     * if
     */
    if (lowerHtml.includes(`mailto:${email}`)) {
      confidence += 0.3;
    }

    const domain = email.split('@')[1];
    /**
     * if
     */
    if (domain) {
      /**
       * if
       */
      if (domain.match(/\.(com|net|org|io|co)$/)) {
        confidence += 0.1;
      }

      /**
       * if
       */
      if (
        email.match(/^(info|contact|hello|support|sales|admin|office)@/) ||
        lowerHtml.includes('contact') ||
        lowerHtml.includes('get in touch')
      ) {
        confidence += 0.1;
      }
    }

    confidence = Math.min(confidence, 1.0);
    emailConfidences.push(confidence);
    totalConfidence += confidence;
  }

  const averageConfidence = emails.length > 0 ? totalConfidence / emails.length : 0;

  return {
    data: emails,
    confidence: averageConfidence,
  };
}
