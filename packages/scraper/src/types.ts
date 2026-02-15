export interface ScrapedContact {
  emails: string[];
  phones: string[];
  addresses: string[];
  socialProfiles: SocialProfile[];
}

export interface SocialProfile {
  platform: SocialPlatform;
  url: string;
  username?: string;
}

export enum SocialPlatform {
  LINKEDIN = 'linkedin',
  TWITTER = 'twitter',
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  YOUTUBE = 'youtube',
  TIKTOK = 'tiktok',
  GITHUB = 'github',
  PINTEREST = 'pinterest',
}

export interface ScrapedCompanyInfo {
  name?: string;
  description?: string;
  industry?: string;
  foundedYear?: string;
  size?: string;
  website?: string;
}

export interface ScrapedData {
  url: string;
  contact: ScrapedContact;
  companyInfo: ScrapedCompanyInfo;
  contactPageUrl?: string;
  aboutPageUrl?: string;
  scrapedAt: Date;
  html?: string;
}

export type ScrapeContext = 'HUNT' | 'AUDIT' | 'MANUAL';

export interface ScraperOptions {
  timeout?: number;
  maxRetries?: number;
  minDelay?: number;
  maxDelay?: number;
  userAgent?: string;
  headless?: boolean;
  followContactPage?: boolean;
  followAboutPage?: boolean;
  maxDepth?: number;
  context?: ScrapeContext;
  includeHtml?: boolean;
}

export interface BrowserConfig {
  headless: boolean;
  timeout: number;
  viewport: {
    width: number;
    height: number;
  };
  userAgent?: string;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface RateLimitConfig {
  minDelay: number;
  maxDelay: number;
}

export interface ExtractorResult<T> {
  data: T;
  confidence: number;
}

export interface PageContext {
  url: string;
  html: string;
  title: string;
  metaTags: Map<string, string>;
}
