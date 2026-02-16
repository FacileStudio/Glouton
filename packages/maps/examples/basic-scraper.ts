import { searchBusinesses, searchBusinessesDetailed } from '@repo/maps';

async function basicExample() {
  console.log('=== Basic Google Maps Scraper Example ===\n');

  const results = await searchBusinesses({
    query: 'coffee shops',
    location: 'Brooklyn',
    hasWebsite: false,
    limit: 20,
    source: 'google-maps',
  });

  console.log(`Found ${results.totalCount} coffee shops without websites\n`);

  results.businesses.slice(0, 5).forEach((business, i) => {
    console.log(`${i + 1}. ${business.name}`);
    console.log(`   Address: ${business.address || 'N/A'}`);
    console.log(`   Phone: ${business.phone || 'N/A'}`);
    console.log(`   Rating: ${business.rating || 'N/A'} (${business.reviewCount || 0} reviews)`);
    console.log('');
  });
}

async function detailedExample() {
  console.log('\n=== Detailed Google Maps Scraper Example ===\n');

  const results = await searchBusinessesDetailed({
    category: 'restaurant',
    location: 'Manhattan',
    limit: 10,
  });

  console.log(`Found ${results.totalCount} restaurants\n`);

  results.businesses.slice(0, 3).forEach((business, i) => {
    console.log(`${i + 1}. ${business.name}`);
    console.log(`   Address: ${business.address || 'N/A'}`);
    console.log(`   Phone: ${business.phone || 'N/A'}`);
    console.log(`   Website: ${business.website || 'N/A'}`);
    console.log(`   Hours: ${business.openingHours || 'N/A'}`);
    console.log(`   Rating: ${business.rating || 'N/A'} (${business.reviewCount || 0} reviews)`);
    console.log('');
  });
}

basicExample().catch(console.error);
