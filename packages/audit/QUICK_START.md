# Quick Start Guide - @repo/audit

## Installation

```bash
bun add @repo/audit
```

## Basic Usage

### Single Website Audit

```typescript
import { auditWebsite } from '@repo/audit';

const result = await auditWebsite('https://example.com');
console.log(result);
```

### Batch Website Audit

```typescript
import { auditWebsites } from '@repo/audit';

const urls = [
  'https://example1.com',
  'https://example2.com',
  'https://example3.com',
];

const results = await auditWebsites(urls, {}, 3);
```

### Custom Configuration

```typescript
import { WebsiteAuditor } from '@repo/audit';

const auditor = new WebsiteAuditor(
  30000,
  'My Custom User Agent',
  3,
  1000
);

auditor.setRateLimitConfig(5, 1000);

const result = await auditor.audit('https://example.com', {
  includeTechnologies: true,
  includeSEO: true,
  includeCompanyInfo: true,
});
```

## What Gets Extracted

### Technologies
- JavaScript frameworks (React, Vue, Angular, Next.js, etc.)
- CSS frameworks (Tailwind, Bootstrap)
- CMS platforms (WordPress, Shopify, Webflow)
- Analytics tools (Google Analytics, Facebook Pixel)
- Hosting providers (Vercel, Netlify, Cloudflare)
- Payment processors (Stripe, PayPal)

### SEO Data
- Title and meta description
- Open Graph tags
- Twitter Card tags
- H1 tags
- Canonical URLs
- Structured data (JSON-LD)

### Company Information
- Company name
- Contact email
- Phone number
- Physical address
- Social media profiles (LinkedIn, Twitter, Facebook, Instagram)
- Founded year
- Industry
- Employee count

### Security
- SSL certificate validation
- Certificate expiration
- Security headers (HSTS, CSP, X-Frame-Options)

### Domain Information
- WHOIS data
- Registrar information
- Registration dates
- Name servers

## Lead Extraction Example

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
    company: result.companyInfo?.name,
    email: result.companyInfo?.email,
    phone: result.companyInfo?.phone,
    technologies: result.technologies?.map(t => t.name),
    linkedin: result.companyInfo?.socialMedia?.linkedin,
  };
}

const lead = await extractLead('https://example.com');
console.log(lead);
```

## Best Practices

1. **Rate Limiting**: Always set rate limits to avoid detection
   ```typescript
   auditor.setRateLimitConfig(5, 1000);
   ```

2. **Error Handling**: Wrap audit calls in try-catch
   ```typescript
   try {
     const result = await auditWebsite(url);
   } catch (error) {
     console.error('Audit failed:', error);
   }
   ```

3. **Batch Processing**: Use `auditWebsites()` for multiple URLs
   ```typescript
   const results = await auditWebsites(urls, {}, 3);
   ```

4. **Custom User Agent**: Use realistic user agents
   ```typescript
   const auditor = new WebsiteAuditor(
     30000,
     'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...'
   );
   ```

5. **Timeouts**: Set appropriate timeouts for slow websites
   ```typescript
   const result = await auditWebsite(url, { timeout: 60000 });
   ```

## Running Examples

```bash
cd packages/audit
bun run examples/basic.ts
bun run examples/batch.ts
bun run examples/lead-extraction.ts
```

## Type Safety

All functions are fully typed with TypeScript:

```typescript
import type {
  AuditResult,
  AuditOptions,
  Technology,
  SEOData,
  CompanyInfo,
} from '@repo/audit';

const result: AuditResult = await auditWebsite(url);
const technologies: Technology[] = result.technologies || [];
const seo: SEOData | undefined = result.seo;
```

## Performance

- Rate limiting: 5 requests per second (configurable)
- Retry logic: 3 attempts with exponential backoff
- Timeout: 30 seconds (configurable)
- Concurrent batch processing: 3 URLs at a time (configurable)

## License

Private package for internal use only.
