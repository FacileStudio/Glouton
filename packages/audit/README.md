# @repo/audit

Comprehensive website auditing and analysis package for extracting technology stack, SEO data, security information, and company details from websites.

## Features

- **Domain Analysis**: WHOIS data, registration dates, nameservers
- **Technology Detection**: Identify frameworks, CMS, analytics, hosting providers
- **SSL/Security Analysis**: Certificate validation, security headers
- **SEO Extraction**: Meta tags, structured data, Open Graph, Twitter Cards
- **Company Information**: Contact details, social media, business info
- **Rate Limiting**: Built-in protection against detection
- **Error Handling**: Robust retry logic and error recovery
- **Type Safety**: Full TypeScript support with Zod validation

## Installation

```bash
bun add @repo/audit
```

## Basic Usage

```typescript
import { auditWebsite } from '@repo/audit';

const result = await auditWebsite('https://example.com');

console.log(result.technologies);
console.log(result.seo);
console.log(result.companyInfo);
```

## Advanced Usage

### Custom Options

```typescript
import { WebsiteAuditor } from '@repo/audit';

const auditor = new WebsiteAuditor(
  30000,
  'Custom User Agent',
  3,
  1000
);

const result = await auditor.audit('https://example.com', {
  includeDomain: true,
  includeTechnologies: true,
  includeSSL: true,
  includeSEO: true,
  includeCompanyInfo: true,
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
});
```

### Batch Auditing

```typescript
import { auditWebsites } from '@repo/audit';

const urls = [
  'https://example1.com',
  'https://example2.com',
  'https://example3.com',
];

const results = await auditWebsites(urls, {
  includeSEO: true,
  includeCompanyInfo: true,
}, 3);
```

### Rate Limiting

```typescript
const auditor = new WebsiteAuditor();

auditor.setRateLimitConfig(5, 1000);

const result = await auditor.audit('https://example.com');
```

## API Reference

### Main Functions

#### `auditWebsite(url, options?)`

Audit a single website.

**Parameters:**
- `url` (string): Website URL to audit
- `options` (AuditOptions): Optional configuration

**Returns:** `Promise<AuditResult>`

#### `auditWebsites(urls, options?, concurrency?)`

Audit multiple websites in batches.

**Parameters:**
- `urls` (string[]): Array of website URLs
- `options` (AuditOptions): Optional configuration
- `concurrency` (number): Number of concurrent requests (default: 3)

**Returns:** `Promise<AuditResult[]>`

### Types

#### `AuditResult`

```typescript
interface AuditResult {
  url: string;
  auditedAt: Date;
  domain?: DomainInfo;
  technologies?: Technology[];
  ssl?: SSLInfo;
  seo?: SEOData;
  companyInfo?: CompanyInfo;
  error?: string;
}
```

#### `AuditOptions`

```typescript
interface AuditOptions {
  includeDomain?: boolean;
  includeTechnologies?: boolean;
  includeSSL?: boolean;
  includePerformance?: boolean;
  includeSEO?: boolean;
  includeCompanyInfo?: boolean;
  includeScreenshots?: boolean;
  timeout?: number;
  userAgent?: string;
  maxRetries?: number;
  retryDelay?: number;
}
```

#### `Technology`

```typescript
interface Technology {
  name: string;
  category: string;
  version?: string;
  confidence: number;
  website?: string;
}
```

#### `CompanyInfo`

```typescript
interface CompanyInfo {
  name?: string;
  description?: string;
  email?: string;
  phone?: string;
  address?: string;
  socialMedia?: {
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    instagram?: string;
    youtube?: string;
  };
  foundedYear?: number;
  industry?: string;
  employees?: string;
}
```

## Analyzers

### Technology Detection

Detects 30+ technologies including:
- JavaScript frameworks (React, Vue, Angular, Next.js, Svelte)
- CSS frameworks (Tailwind, Bootstrap)
- CMS (WordPress, Drupal, Joomla)
- E-commerce (Shopify, WooCommerce, Magento)
- Analytics (Google Analytics, Facebook Pixel, Hotjar)
- Hosting (Vercel, Netlify, Cloudflare)
- And more...

```typescript
import { detectTechnologies } from '@repo/audit';

const technologies = await detectTechnologies($, html, headers);
```

### Security Analysis

```typescript
import { analyzeSSL, analyzeSecurityHeaders, calculateSecurityScore } from '@repo/audit';

const sslInfo = await analyzeSSL('example.com');
const securityHeaders = analyzeSecurityHeaders(headers);
const score = calculateSecurityScore(sslInfo, securityHeaders);
```

### SEO Analysis

```typescript
import { analyzeSEO, calculateSEOScore, analyzeContent } from '@repo/audit';

const seoData = analyzeSEO($, url);
const score = calculateSEOScore(seoData, url);
const content = analyzeContent($, url);
```

### Company Information Extraction

```typescript
import { extractCompanyInfo, calculateCompanyInfoScore } from '@repo/audit';

const companyInfo = await extractCompanyInfo($, url, httpClient);
const score = calculateCompanyInfoScore(companyInfo);
```

## Utilities

### HTTP Client

```typescript
import { HttpClient } from '@repo/audit';

const client = new HttpClient(30000, 'Custom UA', 3, 1000);
const html = await client.get('https://example.com');
const headers = await client.head('https://example.com');
```

### URL Utilities

```typescript
import { normalizeUrl, extractDomain, isValidUrl } from '@repo/audit';

const normalized = normalizeUrl('example.com');
const domain = extractDomain('https://www.example.com');
const valid = isValidUrl('https://example.com');
```

### Parser Utilities

```typescript
import {
  parseHtml,
  extractEmails,
  extractPhones,
  extractSocialLinks,
  extractStructuredData,
  extractMetaTag,
  findAboutPage,
  findContactPage,
} from '@repo/audit';

const $ = parseHtml(html);
const emails = extractEmails(text);
const phones = extractPhones(text);
const social = extractSocialLinks($);
const structuredData = extractStructuredData($);
const metaTag = extractMetaTag($, 'description');
const aboutUrl = findAboutPage($, baseUrl);
const contactUrl = findContactPage($, baseUrl);
```

## Error Handling

All functions use proper error handling with custom `AuditError` class:

```typescript
import { AuditError } from '@repo/audit';

try {
  const result = await auditWebsite('https://example.com');
} catch (error) {
  if (error instanceof AuditError) {
    console.error(`Audit failed: ${error.code}`, error.details);
  }
}
```

## Best Practices

1. **Rate Limiting**: Always configure rate limiting for production use
2. **Batch Processing**: Use `auditWebsites()` for multiple URLs
3. **Error Handling**: Wrap audit calls in try-catch blocks
4. **Concurrency**: Limit concurrent requests to avoid detection
5. **User Agent**: Use realistic user agents to avoid blocking
6. **Timeouts**: Set appropriate timeouts for slow websites

## Example: Lead Extraction

```typescript
import { WebsiteAuditor } from '@repo/audit';

async function extractLead(url: string) {
  const auditor = new WebsiteAuditor();
  auditor.setRateLimitConfig(5, 1000);

  const result = await auditor.audit(url, {
    includeTechnologies: true,
    includeSEO: true,
    includeCompanyInfo: true,
  });

  return {
    url: result.url,
    companyName: result.companyInfo?.name,
    email: result.companyInfo?.email,
    phone: result.companyInfo?.phone,
    technologies: result.technologies?.map(t => t.name),
    industry: result.companyInfo?.industry,
    socialMedia: result.companyInfo?.socialMedia,
  };
}
```

## License

Private package for internal use only.
