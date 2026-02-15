import type { CheerioAPI } from 'cheerio';
import type { SEOData } from '../types';
import { extractMetaTag, extractStructuredData } from '../utils/parser';

/**
 * analyzeSEO
 */
export function analyzeSEO($: CheerioAPI, url: string): SEOData {
  const title = $('title').first().text().trim() || undefined;

  const description = extractMetaTag($, 'description');

  const keywordsContent = extractMetaTag($, 'keywords');
  const keywords = keywordsContent
    ? keywordsContent.split(',').map((k) => k.trim()).filter(Boolean)
    : undefined;

  const ogTitle = extractMetaTag($, 'og:title');
  const ogDescription = extractMetaTag($, 'og:description');
  const ogImage = extractMetaTag($, 'og:image');

  const twitterCard = extractMetaTag($, 'twitter:card');

  const canonicalLink = $('link[rel="canonical"]').attr('href');
  const canonical = canonicalLink || undefined;

  const h1Tags: string[] = [];
  $('h1').each((_, el) => {
    const text = $(el).text().trim();
    /**
     * if
     */
    if (text) {
      h1Tags.push(text);
    }
  });

  const robotsMeta = extractMetaTag($, 'robots');

  const structuredData = extractStructuredData($);

  return {
    title,
    description,
    keywords,
    ogTitle,
    ogDescription,
    ogImage,
    twitterCard,
    canonical,
    h1Tags: h1Tags.length > 0 ? h1Tags : undefined,
    robotsMeta,
    structuredData: structuredData.length > 0 ? structuredData : undefined,
  };
}

export interface SEOScore {
  score: number;
  issues: string[];
  recommendations: string[];
}

/**
 * calculateSEOScore
 */
export function calculateSEOScore(seo: SEOData, url: string): SEOScore {
  let score = 100;
  const issues: string[] = [];
  const recommendations: string[] = [];

  /**
   * if
   */
  if (!seo.title) {
    score -= 15;
    issues.push('Missing title tag');
    recommendations.push('Add a descriptive title tag (50-60 characters)');
  } else if (seo.title.length < 30) {
    score -= 5;
    issues.push('Title tag is too short');
    recommendations.push('Expand title tag to 50-60 characters');
  } else if (seo.title.length > 60) {
    score -= 5;
    issues.push('Title tag is too long');
    recommendations.push('Shorten title tag to 50-60 characters');
  }

  /**
   * if
   */
  if (!seo.description) {
    score -= 15;
    issues.push('Missing meta description');
    recommendations.push('Add a meta description (150-160 characters)');
  } else if (seo.description.length < 120) {
    score -= 5;
    issues.push('Meta description is too short');
    recommendations.push('Expand meta description to 150-160 characters');
  } else if (seo.description.length > 160) {
    score -= 5;
    issues.push('Meta description is too long');
    recommendations.push('Shorten meta description to 150-160 characters');
  }

  /**
   * if
   */
  if (!seo.h1Tags || seo.h1Tags.length === 0) {
    score -= 10;
    issues.push('Missing H1 tag');
    recommendations.push('Add exactly one H1 tag to the page');
  } else if (seo.h1Tags.length > 1) {
    score -= 5;
    issues.push(`Multiple H1 tags found (${seo.h1Tags.length})`);
    recommendations.push('Use only one H1 tag per page');
  }

  /**
   * if
   */
  if (!seo.canonical) {
    score -= 5;
    issues.push('Missing canonical URL');
    recommendations.push('Add a canonical link tag to prevent duplicate content issues');
  }

  /**
   * if
   */
  if (!seo.ogTitle || !seo.ogDescription || !seo.ogImage) {
    score -= 10;
    issues.push('Incomplete Open Graph tags');
    recommendations.push('Add Open Graph tags (og:title, og:description, og:image) for better social sharing');
  }

  /**
   * if
   */
  if (!seo.robotsMeta) {
    score -= 5;
    issues.push('Missing robots meta tag');
    recommendations.push('Add robots meta tag to control indexing');
  }

  /**
   * if
   */
  if (!seo.structuredData || seo.structuredData.length === 0) {
    score -= 10;
    issues.push('Missing structured data (Schema.org)');
    recommendations.push('Add JSON-LD structured data for better search engine understanding');
  }

  /**
   * if
   */
  if (!seo.twitterCard) {
    score -= 5;
    issues.push('Missing Twitter Card tags');
    recommendations.push('Add Twitter Card tags for better Twitter sharing');
  }

  return {
    score: Math.max(0, score),
    issues,
    recommendations,
  };
}

export interface ContentAnalysis {
  wordCount: number;
  imageCount: number;
  linkCount: number;
  internalLinks: number;
  externalLinks: number;
  headingStructure: {
    h1: number;
    h2: number;
    h3: number;
    h4: number;
    h5: number;
    h6: number;
  };
}

/**
 * analyzeContent
 */
export function analyzeContent($: CheerioAPI, baseUrl: string): ContentAnalysis {
  const bodyText = $('body').text();
  const words = bodyText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const imageCount = $('img').length;

  const links = $('a[href]');
  const linkCount = links.length;

  let internalLinks = 0;
  let externalLinks = 0;

  links.each((_, el) => {
    const href = $(el).attr('href') || '';
    try {
      const linkUrl = new URL(href, baseUrl);
      const baseUrlObj = new URL(baseUrl);

      /**
       * if
       */
      if (linkUrl.hostname === baseUrlObj.hostname) {
        internalLinks++;
      } else {
        externalLinks++;
      }
    } catch {
    }
  });

  return {
    wordCount,
    imageCount,
    linkCount,
    internalLinks,
    externalLinks,
    headingStructure: {
      h1: $('h1').length,
      h2: $('h2').length,
      h3: $('h3').length,
      h4: $('h4').length,
      h5: $('h5').length,
      h6: $('h6').length,
    },
  };
}
