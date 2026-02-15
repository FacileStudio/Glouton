# @repo/maps Examples

This directory contains practical examples demonstrating different use cases for the maps package.

## Running Examples

All examples use Bun:

```bash
bun run examples/basic-scraper.ts
bun run examples/openstreetmap.ts
bun run examples/multi-source.ts
bun run examples/lead-generation.ts
```

## Examples Overview

### 1. basic-scraper.ts
Basic Google Maps scraper usage:
- Search for businesses without websites
- Get detailed business information
- Extract ratings and reviews

### 2. openstreetmap.ts
OpenStreetMap/Overpass API usage:
- Search by category
- Custom tag-based queries
- Free, no API key required

### 3. multi-source.ts
Multi-source search with deduplication:
- Combine Google Maps and OpenStreetMap results
- Automatic deduplication
- Filter by website presence

### 4. lead-generation.ts
Complete lead generation workflow:
- Batch processing multiple cities
- Filter by ratings and phone numbers
- Export to CSV format
- Campaign management

## Use Cases

### Lead Generation for Web Development
Find businesses without websites to offer web development services:

```bash
bun run examples/lead-generation.ts
```

### Local Business Research
Research businesses in specific areas:

```bash
bun run examples/basic-scraper.ts
```

### Data Collection
Collect business data from multiple sources:

```bash
bun run examples/multi-source.ts
```

## Tips

1. **Rate Limiting**: Add delays between requests when scraping
2. **Error Handling**: Always wrap searches in try/catch
3. **Data Quality**: Verify contact information before use
4. **Privacy**: Respect data usage policies and privacy laws
