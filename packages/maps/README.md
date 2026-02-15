# @repo/maps

Comprehensive package for extracting local business data from multiple sources including Google Maps (via web scraping) and OpenStreetMap/Overpass API.

## Features

- **Google Maps Scraper** - Playwright-based stealth scraping (no API key required)
- **Google Maps API** - Official API integration (requires API key, has usage limits)
- **OpenStreetMap/Overpass API** - Free, open-source data (no API key required)
- **Unified Business Data** - Consistent interface across all sources
- **Smart Deduplication** - Merge results from multiple sources
- **Website Detection** - Filter businesses by "has website" / "no website"
- **Category Search** - Search by business type (restaurants, retail, services, etc.)
- **Location Flexibility** - Search by city, coordinates, or bounding box

## Installation

```bash
bun add @repo/maps
```

## Quick Start

### Simple Search (Scraper - Recommended)

```typescript
import { searchBusinesses } from '@repo/maps';

const results = await searchBusinesses({
  query: 'restaurants',
  location: 'New York',
  hasWebsite: false,
  limit: 50,
  source: 'all',
});

console.log(`Found ${results.totalCount} businesses`);
results.businesses.forEach((business) => {
  console.log(`${business.name} - ${business.address}`);
});
```

### Google Maps Scraper (No API Key)

```typescript
import { GoogleMapsScraper } from '@repo/maps';

const scraper = new GoogleMapsScraper({
  headless: true,
  maxResults: 100,
  delayBetweenScrolls: 2000,
});

await scraper.initialize();

const businesses = await scraper.search({
  query: 'coffee shops in Brooklyn',
  hasWebsite: false,
});

await scraper.close();

console.log(`Found ${businesses.length} coffee shops without websites`);
```

### OpenStreetMap Search (Free API)

```typescript
import { searchOpenStreetMap } from '@repo/maps';

const businesses = await searchOpenStreetMap({
  category: 'restaurant',
  location: 'San Francisco',
  hasWebsite: true,
  limit: 50,
});

console.log(`Found ${businesses.length} restaurants with websites`);
```

### Google Maps API (Requires API Key)

```typescript
import { GoogleMapsService } from '@repo/maps';

const service = new GoogleMapsService('YOUR_API_KEY');

const result = await service.searchNearby({
  location: 'Los Angeles',
  category: 'retail',
  radius: 5000,
  maxResults: 50,
  hasWebsite: false,
});

console.log(`Found ${result.businesses.length} retail stores without websites`);
```

## Search Options

```typescript
interface SearchOptions {
  query?: string;
  location?: string | BoundingBox | Coordinates;
  category?: BusinessCategory;
  hasWebsite?: boolean;
  limit?: number;
  source?: 'google-maps' | 'openstreetmap' | 'all';
}
```

### Business Categories

Supported categories:
- `restaurant`, `cafe`, `bar`, `hotel`
- `retail`, `office`, `service`
- `healthcare`, `education`, `entertainment`
- `automotive`, `real-estate`, `finance`
- `beauty`, `fitness`, `travel`
- `grocery`, `pharmacy`, `pet-services`
- `home-services`, `professional-services`

### Location Formats

#### City Name
```typescript
location: 'New York'
location: 'San Francisco'
```

#### Coordinates
```typescript
location: { lat: 40.7128, lng: -74.0060 }
```

#### Bounding Box
```typescript
location: {
  south: 40.4774,
  west: -74.2590,
  north: 40.9176,
  east: -73.7004,
}
```

## Business Data Structure

```typescript
interface LocalBusiness {
  source: 'google-maps' | 'openstreetmap';
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  phone?: string;
  website?: string;
  hasWebsite: boolean;
  category?: string;
  rating?: number;
  reviewCount?: number;
  coordinates?: { lat: number; lng: number };
  openingHours?: string;
  metadata?: Record<string, any>;
}
```

## Advanced Usage

### Detailed Google Maps Scraping

Get detailed information including phone numbers, websites, and hours:

```typescript
import { searchBusinessesDetailed } from '@repo/maps';

const results = await searchBusinessesDetailed({
  category: 'restaurant',
  location: 'Chicago',
  limit: 20,
});

results.businesses.forEach((business) => {
  console.log(`${business.name}`);
  console.log(`  Phone: ${business.phone}`);
  console.log(`  Website: ${business.website}`);
  console.log(`  Hours: ${business.openingHours}`);
  console.log(`  Rating: ${business.rating} (${business.reviewCount} reviews)`);
});
```

### Custom Overpass API Query

```typescript
import { searchByOverpassTags } from '@repo/maps';

const businesses = await searchByOverpassTags(
  { amenity: 'restaurant', cuisine: 'italian' },
  { south: 40.7, west: -74.0, north: 40.8, east: -73.9 }
);
```

### Multi-Source Search with Deduplication

```typescript
import { searchBusinesses } from '@repo/maps';

const results = await searchBusinesses({
  category: 'cafe',
  location: 'Brooklyn',
  source: 'all',
  limit: 100,
});

console.log('Results from multiple sources, deduplicated:');
results.businesses.forEach((business) => {
  console.log(`${business.name} (Source: ${business.source})`);
});
```

### Using the Orchestrator (API-based)

```typescript
import { MapsOrchestrator } from '@repo/maps';

const orchestrator = new MapsOrchestrator({
  googleMapsApiKey: 'YOUR_API_KEY',
  useGoogleMaps: true,
  useOpenStreetMap: true,
});

const businesses = await orchestrator.search({
  location: 'Seattle',
  category: 'coffee',
  maxResults: 50,
  hasWebsite: true,
});
```

### Filtering Results

```typescript
import { applyFilters } from '@repo/maps';

let businesses = await searchBusinesses({
  category: 'restaurant',
  location: 'Manhattan',
});

const filtered = applyFilters(businesses.businesses, {
  hasWebsite: false,
  category: 'italian',
  limit: 25,
});
```

### Geocoding Utilities

```typescript
import { cityToBoundingBox, coordinatesToBoundingBox } from '@repo/maps';

const nycBox = cityToBoundingBox('New York');
console.log(nycBox);

const customBox = coordinatesToBoundingBox(
  { lat: 40.7128, lng: -74.0060 },
  10
);
console.log(customBox);
```

## Comparison: Scraper vs API

### Google Maps Scraper (Playwright)
**Pros:**
- No API key required
- No usage limits or costs
- Can access publicly visible data
- Bypass API rate limits

**Cons:**
- Slower than API
- May break if Google changes their UI
- Requires browser automation
- Rate limiting recommended to avoid detection

### Google Maps API
**Pros:**
- Official, stable interface
- Fast and reliable
- Structured data guarantee
- Better for production at scale

**Cons:**
- Requires API key
- Usage costs (paid after free tier)
- Rate limits
- Requires billing account

### OpenStreetMap/Overpass API
**Pros:**
- Completely free
- No API key required
- Open data
- Community maintained

**Cons:**
- Less comprehensive than Google Maps
- Data quality varies by region
- Rate limits (fair use policy)
- Missing some business details

## Best Practices

### Rate Limiting

For Google Maps scraping:
```typescript
const scraper = new GoogleMapsScraper({
  delayBetweenScrolls: 2000,
  delayAfterSearch: 3000,
});
```

### Error Handling

```typescript
try {
  const results = await searchBusinesses({
    query: 'restaurants',
    location: 'Unknown City',
  });
} catch (error) {
  console.error('Search failed:', error);
}
```

### Batch Processing

```typescript
const cities = ['New York', 'Los Angeles', 'Chicago'];

for (const city of cities) {
  const results = await searchBusinesses({
    category: 'restaurant',
    location: city,
    hasWebsite: false,
  });

  console.log(`${city}: ${results.totalCount} restaurants without websites`);

  await new Promise((resolve) => setTimeout(resolve, 5000));
}
```

## Deduplication

The package automatically deduplicates businesses when using multiple sources:

```typescript
import { deduplicateBusinesses } from '@repo/maps';

const allBusinesses = [...gmapsResults, ...osmResults];
const unique = deduplicateBusinesses(allBusinesses);
```

Deduplication uses:
- Name similarity (Levenshtein distance)
- Geographic proximity (< 100m)
- Phone number matching
- Website URL matching

## Examples

### Find Businesses Without Websites

```typescript
import { searchBusinesses } from '@repo/maps';

const results = await searchBusinesses({
  category: 'retail',
  location: 'Brooklyn',
  hasWebsite: false,
  limit: 100,
  source: 'google-maps',
});

console.log(`Found ${results.totalCount} retail stores without websites`);

results.businesses.forEach((business) => {
  console.log(`${business.name} - ${business.phone || 'No phone'}`);
});
```

### Export to CSV

```typescript
import { searchBusinesses } from '@repo/maps';
import { writeFileSync } from 'fs';

const results = await searchBusinesses({
  category: 'restaurant',
  location: 'Miami',
  limit: 200,
});

const csv = [
  'Name,Address,Phone,Website,Rating,Reviews',
  ...results.businesses.map((b) =>
    [
      b.name,
      b.address || '',
      b.phone || '',
      b.website || '',
      b.rating || '',
      b.reviewCount || '',
    ].join(',')
  ),
].join('\n');

writeFileSync('restaurants.csv', csv);
```

### Lead Generation

```typescript
import { searchBusinesses } from '@repo/maps';

async function findLeads(city: string, category: string) {
  const results = await searchBusinesses({
    category,
    location: city,
    hasWebsite: false,
    limit: 100,
    source: 'all',
  });

  const leads = results.businesses.filter(
    (b) => b.phone && !b.website
  );

  console.log(`Found ${leads.length} leads in ${city}`);

  return leads.map((lead) => ({
    name: lead.name,
    phone: lead.phone,
    address: lead.address,
    category: lead.category,
    rating: lead.rating,
    source: lead.source,
  }));
}

const leads = await findLeads('Austin', 'restaurant');
console.log(leads);
```

## TypeScript Support

Full TypeScript support with type definitions:

```typescript
import type {
  LocalBusiness,
  SearchOptions,
  SearchResult,
  BusinessCategory,
  BoundingBox,
  Coordinates,
} from '@repo/maps';
```

## License

MIT
