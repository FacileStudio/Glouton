# @repo/scraper - Feature Documentation

## Overview

The scraper package provides comprehensive web scraping capabilities with advanced anti-detection measures for extracting business contact information from websites.

## Core Features

### 1. Email Extraction

Multiple detection methods:
- Standard email patterns (`user@domain.com`)
- Obfuscated emails with `[at]`, `[dot]`, `(at)`, `(dot)` replacements
- Mailto links extraction
- Data attribute scanning (`data-email`)
- Context-aware validation

Filtering:
- Disposable email domain filtering
- Non-contact email filtering (`noreply@`, `donotreply@`, etc.)
- Email format validation
- Domain validation

### 2. Phone Number Extraction

Supported formats:
- US format: `(555) 123-4567`
- International: `+1 555-123-4567`
- Dotted: `555.123.4567`
- Dashed: `555-123-4567`
- Tel links (`tel:+1555123456`)
- Data attributes (`data-phone`, `data-tel`)

Validation:
- Length validation (10-15 digits)
- Format normalization
- Duplicate removal

### 3. Address Extraction

Features:
- US address pattern recognition
- Street type detection (Street, Avenue, Road, Drive, etc.)
- ZIP code extraction
- State abbreviation recognition
- Structured data extraction (Schema.org)
- Address validation

### 4. Social Media Profile Detection

Supported platforms:
- LinkedIn (personal profiles and company pages)
- Twitter/X
- Facebook
- Instagram
- YouTube (channels, users, @handles)
- TikTok
- GitHub
- Pinterest

Features:
- Username extraction
- URL normalization
- Platform detection
- Validation (excludes privacy, terms, help pages)
- Multiple pattern matching per platform

### 5. Page Discovery

Automatic discovery of:
- Contact pages (`/contact`, `/get-in-touch`, `/reach-us`, etc.)
- About pages (`/about`, `/about-us`, `/our-story`, `/company`, etc.)
- Configurable depth and follow behavior

### 6. Company Information Extraction

Sources:
- Structured data (JSON-LD, Schema.org)
- Meta tags (Open Graph, Twitter Cards)
- About page content analysis

Extracted fields:
- Company name
- Description
- Industry
- Founded year
- Company size
- Website URL

## Anti-Detection Techniques

### 1. Browser Stealth

Playwright-based stealth configurations:
- `webdriver` property masking
- Chrome runtime object injection
- Plugin array spoofing
- Navigator properties masking
- Permission query override

### 2. Fingerprint Randomization

Randomized attributes:
- User agents (Chrome, Firefox, Edge, Safari)
- Viewport sizes (1920x1080, 1366x768, 1440x900, etc.)
- Screen resolution
- Platform (Windows, macOS, Linux)
- Hardware concurrency (4, 8, 12, 16 cores)
- Device memory (4GB, 8GB, 16GB)
- Timezone
- Color depth
- Pixel ratio

### 3. Canvas Fingerprinting Evasion

Techniques:
- Canvas noise injection
- Random pixel shifts (R, G, B, A channels)
- `toBlob()` override
- `toDataURL()` override
- `getImageData()` override

### 4. WebGL Fingerprinting Protection

Masking:
- Vendor spoofing (Intel Inc.)
- Renderer spoofing (Intel Iris OpenGL Engine)
- `getParameter()` override

### 5. Request Rate Limiting

Configuration:
- Minimum delay between requests (default: 2000ms)
- Maximum delay between requests (default: 5000ms)
- Random delay distribution
- Configurable retry logic

### 6. Request Headers

Realistic headers:
- Accept: HTML, XHTML, XML with quality values
- Accept-Language: en-US, en
- Accept-Encoding: gzip, deflate, br
- Cache-Control: no-cache
- Sec-Fetch-* headers
- DNT: 1

### 7. Retry Logic

Features:
- Exponential backoff
- Maximum retry attempts (default: 3)
- Navigation timeout handling
- Load state monitoring
- Graceful failure handling

### 8. Resource Optimization

Performance improvements:
- Image blocking
- Stylesheet blocking
- Font blocking
- Media blocking
- Faster page loads
- Reduced bandwidth

## API Design

### Simple API

```typescript
const data = await scrapeWebsite('https://example.com');
```

### Advanced API

```typescript
const scraper = new WebScraper(options);
await scraper.initialize();
const data = await scraper.scrape(url);
await scraper.close();
```

### Batch Processing

```typescript
const results = await scrapeWebsites(urls, options);
```

### Individual Extractors

```typescript
import { extractEmails, extractPhones, extractAddresses, extractSocialProfiles } from '@repo/scraper';
```

## Configuration Options

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

## Performance Characteristics

- Fast HTML parsing with cheerio
- Efficient regex patterns
- Minimal memory footprint
- Resource blocking for speed
- Parallel link extraction
- Deduplication of results

## Security Considerations

- No credential storage
- HTTPS URL normalization
- Input validation
- Error handling
- Timeout protection
- Memory leak prevention

## Integration with Lead Extraction System

The scraper integrates seamlessly with:
- `@repo/jobs` - For background scraping jobs
- `@repo/lead-sources` - For multi-source lead generation
- `@repo/hunter` - For email verification
- `@repo/trpc` - For API endpoints

Example integration:
```typescript
import { WebScraper } from '@repo/scraper';
import { QueueManager } from '@repo/jobs';

const scraper = new WebScraper({
  headless: true,
  minDelay: 3000,
  maxDelay: 6000,
});

await scraper.initialize();

const data = await scraper.scrape(websiteUrl);

await queueManager.addJob('email-verification', 'verify-emails', {
  emails: data.contact.emails,
});
```

## Future Enhancements

Potential additions:
- CAPTCHA solving integration
- Proxy rotation support
- Cookie management
- Session persistence
- Screenshot capture
- PDF parsing
- Image OCR for contact info
- AI-powered content extraction
- Multi-language support
- Rate limit detection and auto-throttling
