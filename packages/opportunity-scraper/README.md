# @repo/opportunity-scraper

Multi-source freelance opportunity scraper package for Glouton.

## Features

- Modular scraper architecture with pluggable sources
- Support for multiple freelance platforms (Codeur, Malt, We Work Remotely, etc.)
- Automatic category detection and tagging
- Budget extraction and parsing
- Rate limiting and anti-detection measures
- Comprehensive error handling

## Supported Platforms

### Currently Implemented
- **Codeur.com** - French freelance platform
- **Malt** - European freelance marketplace
- **We Work Remotely** - Remote job board

### Planned
- Freelance Informatique
- Comet
- Le Hibou
- Upwork
- Fiverr
- Freelancer.com
- Remote.co
- Remotive
- LinkedIn
- Indeed

## Usage

```typescript
import { ScraperManager, OpportunitySource, OpportunityCategory } from '@repo/opportunity-scraper';

const manager = new ScraperManager();

const config = {
  source: OpportunitySource.MALT,
  enabled: true,
  categories: [
    OpportunityCategory.WEB_DEVELOPMENT,
    OpportunityCategory.FRONTEND,
  ],
  maxPages: 3,
};

const result = await manager.scrapeSource(config);

console.log(`Found ${result.opportunities.length} opportunities`);
console.log(`Errors: ${result.errors.length}`);
```

## Adding a New Scraper

1. Create a new file in `src/scrapers/[platform].ts`
2. Extend `AbstractScraper` class
3. Implement the `scrape()` method
4. Register in `ScraperManager` constructor

Example:

```typescript
import { AbstractScraper } from './base';
import type { ScraperConfig, ScraperResult } from '../types';
import { OpportunitySource } from '../types';

export class MyPlatformScraper extends AbstractScraper {
  readonly source = OpportunitySource.MY_PLATFORM;

  async scrape(config: ScraperConfig): Promise<ScraperResult> {
    // Implementation
  }
}
```

## Anti-Detection Features

- Random delays between requests
- Realistic user agent and headers
- Headless browser automation with Playwright
- Viewport randomization

## Architecture

- `types.ts` - TypeScript interfaces and enums
- `scrapers/base.ts` - Abstract base class with common utilities
- `scrapers/[platform].ts` - Platform-specific scrapers
- `scraper-manager.ts` - Central orchestration and registration
