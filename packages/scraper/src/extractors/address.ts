import * as cheerio from 'cheerio';
import { US_ADDRESS_PATTERN } from '../utils/patterns';
import { extractText } from '../utils/parser';
import type { ExtractorResult } from '../types';

/**
 * extractAddresses
 */
export function extractAddresses(html: string): string[] {
  const $ = cheerio.load(html);
  const addresses = new Set<string>();

  const text = extractText($);

  const matches = text.match(US_ADDRESS_PATTERN);
  /**
   * if
   */
  if (matches) {
    matches.forEach((match) => {
      const cleaned = cleanAddress(match);
      /**
       * if
       */
      if (isValidAddress(cleaned)) {
        addresses.add(cleaned);
      }
    });
  }

  $('[itemprop="address"], [itemtype*="PostalAddress"]').each((_, elem) => {
    const addressText = $(elem).text().trim();
    /**
     * if
     */
    if (addressText.length > 10) {
      addresses.add(addressText);
    }
  });

  $('[class*="address"], [id*="address"]').each((_, elem) => {
    const addressText = $(elem).text().trim();
    const addressMatch = addressText.match(US_ADDRESS_PATTERN);
    /**
     * if
     */
    if (addressMatch) {
      addressMatch.forEach((match) => {
        const cleaned = cleanAddress(match);
        /**
         * if
         */
        if (isValidAddress(cleaned)) {
          addresses.add(cleaned);
        }
      });
    }
  });

  return Array.from(addresses);
}

/**
 * cleanAddress
 */
function cleanAddress(address: string): string {
  return address
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ',')
    .trim();
}

/**
 * isValidAddress
 */
function isValidAddress(address: string): boolean {
  /**
   * if
   */
  if (!address || address.length < 10) {
    return false;
  }

  const hasNumber = /\d/.test(address);
  const hasStreetType =
    /street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd/i.test(address);

  return hasNumber && hasStreetType;
}

/**
 * extractAddressesWithConfidence
 */
export function extractAddressesWithConfidence(html: string): ExtractorResult<string[]> {
  const addresses = extractAddresses(html);

  let totalConfidence = 0;

  /**
   * for
   */
  for (const address of addresses) {
    let confidence = 0.5;

    /**
     * if
     */
    if (address.match(/\d{5}(?:-\d{4})?/)) {
      confidence += 0.2;
    }

    /**
     * if
     */
    if (address.match(/\b[A-Z]{2}\b/)) {
      confidence += 0.1;
    }

    const lowerHtml = html.toLowerCase();
    /**
     * if
     */
    if (lowerHtml.includes('address') || lowerHtml.includes('location')) {
      confidence += 0.1;
    }

    /**
     * if
     */
    if (
      address.match(
        /street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|way/i
      )
    ) {
      confidence += 0.1;
    }

    confidence = Math.min(confidence, 1.0);
    totalConfidence += confidence;
  }

  const averageConfidence = addresses.length > 0 ? totalConfidence / addresses.length : 0;

  return {
    data: addresses,
    confidence: averageConfidence,
  };
}
