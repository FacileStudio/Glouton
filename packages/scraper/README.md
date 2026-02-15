# @repo/scraper

A comprehensive stealth web scraper for extracting business contact data from websites with advanced anti-detection measures.

## Features

- Email extraction with obfuscation handling
- Phone number extraction (multiple formats)
- Physical address extraction
- Social media profile detection (LinkedIn, Twitter, Facebook, Instagram, YouTube, TikTok, GitHub, Pinterest)
- Contact and About page discovery
- Company information extraction from structured data
- Advanced anti-detection techniques
- Browser fingerprint randomization
- Request rate limiting and retry logic

## Anti-Detection Techniques

- Playwright-based headless browser with stealth configurations
- Randomized user agents and browser fingerprints
- Canvas fingerprinting evasion
- WebGL fingerprinting protection
- Webdriver detection bypass
- Natural request delays (2-5 seconds)
- Viewport and screen resolution randomization
- Navigator properties masking
- Automatic retry with exponential backoff

## Installation

```bash
bun install
```

## Usage

### Basic Scraping

```typescript
import { scrapeWebsite } from '@repo/scraper';

const data = await scrapeWebsite('https://example.com');

console.log(data.contact.emails);
console.log(data.contact.phones);
console.log(data.contact.socialProfiles);
```

### Advanced Usage with Options

```typescript
import { WebScraper } from '@repo/scraper';

const scraper = new WebScraper({
  timeout: 30000,
  maxRetries: 3,
  minDelay: 2000,
  maxDelay: 5000,
  headless: true,
  followContactPage: true,
  followAboutPage: true,
});

await scraper.initialize();

const data = await scraper.scrape('https://example.com');

await scraper.close();
```

### Scraping Multiple Sites

```typescript
import { scrapeWebsites } from '@repo/scraper';

const urls = [
  'https://example1.com',
  'https://example2.com',
  'https://example3.com',
];

const results = await scrapeWebsites(urls, {
  minDelay: 3000,
  maxDelay: 6000,
});

for (const [url, data] of results) {
  console.log(`${url}: ${data.contact.emails.length} emails found`);
}
```

### Using Individual Extractors

```typescript
import {
  extractEmails,
  extractPhones,
  extractAddresses,
  extractSocialProfiles,
} from '@repo/scraper';

const html = '<html>...</html>';

const emails = extractEmails(html);
const phones = extractPhones(html);
const addresses = extractAddresses(html);
const socialProfiles = extractSocialProfiles(html);
```

## API Reference

### WebScraper

Main scraper class with browser automation.

#### Options

```typescript
interface ScraperOptions {
  timeout?: number;
  maxRetries?: number;
  minDelay?: number;
  maxDelay?: number;
  userAgent?: string;
  headless?: boolean;
  followContactPage?: boolean;
  followAboutPage?: boolean;
  maxDepth?: number;
}
```

#### Methods

- `initialize()`: Initialize the stealth browser
- `scrape(url: string)`: Scrape a single website
- `scrapeMultiple(urls: string[])`: Scrape multiple websites
- `close()`: Close the browser and cleanup

### Scraped Data Structure

```typescript
interface ScrapedData {
  url: string;
  contact: {
    emails: string[];
    phones: string[];
    addresses: string[];
    socialProfiles: SocialProfile[];
  };
  companyInfo: {
    name?: string;
    description?: string;
    industry?: string;
    foundedYear?: string;
    size?: string;
    website?: string;
  };
  contactPageUrl?: string;
  aboutPageUrl?: string;
  scrapedAt: Date;
}
```

### Social Profile

```typescript
interface SocialProfile {
  platform: 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'youtube' | 'tiktok' | 'github' | 'pinterest';
  url: string;
  username?: string;
}
```

## Email Extraction

Handles various email formats and obfuscations:

- Standard format: `user@example.com`
- Obfuscated with `[at]` and `[dot]`
- Obfuscated with `(at)` and `(dot)`
- Mailto links
- Data attributes
- Filters out disposable and non-contact emails

## Phone Extraction

Supports multiple phone number formats:

- US format: `(123) 456-7890`
- International format: `+1 123-456-7890`
- Dotted format: `123.456.7890`
- Tel links
- Data attributes

## Social Media Detection

Automatically detects and extracts:

- LinkedIn profiles and company pages
- Twitter/X handles
- Facebook pages
- Instagram profiles
- YouTube channels
- TikTok profiles
- GitHub repositories
- Pinterest profiles

## Best Practices

1. Always use delays between requests to avoid rate limiting
2. Set `headless: true` for production to reduce resource usage
3. Use `followContactPage: true` for better contact information
4. Handle errors gracefully as some sites may block scrapers
5. Respect robots.txt and website terms of service
6. Consider using a proxy rotation service for large-scale scraping

## Performance

- Lightweight HTML parsing with cheerio
- Resource blocking (images, stylesheets, fonts) for faster scraping
- Efficient regex patterns
- Deduplication of results
- Parallel link extraction

## Error Handling

The scraper includes comprehensive error handling:

- Automatic retries with exponential backoff
- Timeout protection
- Navigation failure handling
- Page load state monitoring
- Graceful degradation when sub-pages fail

## License

Private package - not for distribution
