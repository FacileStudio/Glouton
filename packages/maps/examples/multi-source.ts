import { searchBusinesses } from '@repo/maps';

/**
 * multiSourceExample
 */
async function multiSourceExample() {
  console.log('=== Multi-Source Search with Deduplication ===\n');

  const results = await searchBusinesses({
    category: 'restaurant',
    location: 'Seattle',
    source: 'all',
    limit: 30,
  });

  console.log(`Found ${results.totalCount} unique restaurants (deduplicated)\n`);

  const bySource = results.businesses.reduce(
    (acc, b) => {
      acc[b.source] = (acc[b.source] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log('Results by source:');
  console.log(`  Google Maps: ${bySource['google-maps'] || 0}`);
  console.log(`  OpenStreetMap: ${bySource['openstreetmap'] || 0}`);
  console.log('');

  console.log('Sample results:');
  results.businesses.slice(0, 5).forEach((business, i) => {
    console.log(`${i + 1}. ${business.name} (${business.source})`);
    console.log(`   Address: ${business.address || 'N/A'}`);
    console.log(`   Website: ${business.website || 'None'}`);
    console.log('');
  });
}

/**
 * findBusinessesWithoutWebsites
 */
async function findBusinessesWithoutWebsites() {
  console.log('\n=== Finding Businesses Without Websites ===\n');

  const results = await searchBusinesses({
    category: 'retail',
    location: 'Brooklyn',
    hasWebsite: false,
    source: 'all',
    limit: 50,
  });

  console.log(`Found ${results.totalCount} retail businesses without websites\n`);

  const withPhone = results.businesses.filter((b) => b.phone);
  console.log(`${withPhone.length} have phone numbers\n`);

  console.log('Sample leads:');
  withPhone.slice(0, 5).forEach((business, i) => {
    console.log(`${i + 1}. ${business.name}`);
    console.log(`   Phone: ${business.phone}`);
    console.log(`   Address: ${business.address || 'N/A'}`);
    console.log(`   Source: ${business.source}`);
    console.log('');
  });
}

/**
 * multiSourceExample
 */
multiSourceExample()
  .then(() => findBusinessesWithoutWebsites())
  .catch(console.error);
