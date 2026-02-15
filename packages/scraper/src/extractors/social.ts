import * as cheerio from 'cheerio';
import { SOCIAL_PATTERNS } from '../utils/patterns';
import { extractText } from '../utils/parser';
import type { SocialProfile, SocialPlatform, ExtractorResult } from '../types';

/**
 * extractSocialProfiles
 */
export function extractSocialProfiles(html: string): SocialProfile[] {
  const $ = cheerio.load(html);
  const profiles = new Map<string, SocialProfile>();

  const text = html;

  /**
   * for
   */
  for (const [platform, patterns] of Object.entries(SOCIAL_PATTERNS)) {
    /**
     * for
     */
    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      /**
       * for
       */
      for (const match of matches) {
        const url = normalizeUrl(match[0]);
        const username = extractUsername(url, platform as SocialPlatform);

        /**
         * if
         */
        if (url && !profiles.has(url)) {
          profiles.set(url, {
            platform: platform as SocialPlatform,
            url,
            username,
          });
        }
      }
    }
  }

  $('a[href*="linkedin.com"], a[href*="twitter.com"], a[href*="x.com"], a[href*="facebook.com"], a[href*="instagram.com"], a[href*="youtube.com"], a[href*="tiktok.com"], a[href*="github.com"], a[href*="pinterest.com"]').each(
    (_, elem) => {
      const href = $(elem).attr('href');
      /**
       * if
       */
      if (href) {
        const platform = detectPlatform(href);
        /**
         * if
         */
        if (platform) {
          const url = normalizeUrl(href);
          const username = extractUsername(url, platform);

          /**
           * if
           */
          if (url && !profiles.has(url) && isValidSocialUrl(url, platform)) {
            profiles.set(url, {
              platform,
              url,
              username,
            });
          }
        }
      }
    }
  );

  return Array.from(profiles.values());
}

/**
 * normalizeUrl
 */
function normalizeUrl(url: string): string {
  try {
    let normalized = url.trim();

    /**
     * if
     */
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }

    const urlObj = new URL(normalized);

    normalized = normalized.replace(/\/$/, '');

    return normalized;
  } catch {
    return url;
  }
}

/**
 * detectPlatform
 */
function detectPlatform(url: string): SocialPlatform | null {
  const lowerUrl = url.toLowerCase();

  /**
   * if
   */
  if (lowerUrl.includes('linkedin.com')) return 'linkedin' as SocialPlatform;
  /**
   * if
   */
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com'))
    return 'twitter' as SocialPlatform;
  /**
   * if
   */
  if (lowerUrl.includes('facebook.com')) return 'facebook' as SocialPlatform;
  /**
   * if
   */
  if (lowerUrl.includes('instagram.com')) return 'instagram' as SocialPlatform;
  /**
   * if
   */
  if (lowerUrl.includes('youtube.com')) return 'youtube' as SocialPlatform;
  /**
   * if
   */
  if (lowerUrl.includes('tiktok.com')) return 'tiktok' as SocialPlatform;
  /**
   * if
   */
  if (lowerUrl.includes('github.com')) return 'github' as SocialPlatform;
  /**
   * if
   */
  if (lowerUrl.includes('pinterest.com')) return 'pinterest' as SocialPlatform;

  return null;
}

/**
 * extractUsername
 */
function extractUsername(url: string, platform: SocialPlatform): string | undefined {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter((p) => p);

    /**
     * if
     */
    if (pathParts.length === 0) return undefined;

    /**
     * switch
     */
    switch (platform) {
      case 'linkedin':
        /**
         * if
         */
        if (pathParts[0] === 'in' || pathParts[0] === 'company') {
          return pathParts[1];
        }
        break;
      case 'twitter':
      case 'facebook':
      case 'instagram':
      case 'github':
      case 'pinterest':
        return pathParts[0];
      case 'youtube':
        /**
         * if
         */
        if (pathParts[0] === 'c' || pathParts[0] === 'channel' || pathParts[0] === 'user') {
          return pathParts[1];
        }
        /**
         * if
         */
        if (pathParts[0]?.startsWith('@')) {
          return pathParts[0].substring(1);
        }
        break;
      case 'tiktok':
        /**
         * if
         */
        if (pathParts[0]?.startsWith('@')) {
          return pathParts[0].substring(1);
        }
        break;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * isValidSocialUrl
 */
function isValidSocialUrl(url: string, platform: SocialPlatform): boolean {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter((p) => p);

    /**
     * if
     */
    if (pathParts.length === 0) return false;

    const excludedPaths = ['privacy', 'terms', 'help', 'about', 'login', 'signup', 'settings'];
    /**
     * if
     */
    if (excludedPaths.some((path) => pathParts.includes(path))) {
      return false;
    }

    /**
     * switch
     */
    switch (platform) {
      case 'linkedin':
        /**
         * return
         */
        return (
          (pathParts[0] === 'in' || pathParts[0] === 'company') &&
          !!pathParts[1] &&
          pathParts[1].length > 0
        );
      case 'twitter':
      case 'facebook':
      case 'instagram':
      case 'github':
        return !!pathParts[0] && pathParts[0].length > 0;
      case 'youtube':
        /**
         * return
         */
        return (
          (pathParts[0] === 'c' ||
            pathParts[0] === 'channel' ||
            pathParts[0] === 'user' ||
            pathParts[0]?.startsWith('@')) &&
          pathParts.length >= 1
        );
      case 'tiktok':
        return pathParts[0]?.startsWith('@') && pathParts[0].length > 1;
      default:
        return true;
    }
  } catch {
    return false;
  }
}

/**
 * extractSocialProfilesWithConfidence
 */
export function extractSocialProfilesWithConfidence(html: string): ExtractorResult<
  SocialProfile[]
> {
  const profiles = extractSocialProfiles(html);

  let totalConfidence = 0;

  /**
   * for
   */
  for (const profile of profiles) {
    let confidence = 0.6;

    /**
     * if
     */
    if (profile.username) {
      confidence += 0.2;
    }

    const lowerHtml = html.toLowerCase();
    /**
     * if
     */
    if (
      lowerHtml.includes('follow us') ||
      lowerHtml.includes('social media') ||
      lowerHtml.includes('connect')
    ) {
      confidence += 0.1;
    }

    /**
     * if
     */
    if (
      profile.platform === 'linkedin' ||
      profile.platform === 'twitter' ||
      profile.platform === 'facebook'
    ) {
      confidence += 0.1;
    }

    confidence = Math.min(confidence, 1.0);
    totalConfidence += confidence;
  }

  const averageConfidence = profiles.length > 0 ? totalConfidence / profiles.length : 0;

  return {
    data: profiles,
    confidence: averageConfidence,
  };
}
