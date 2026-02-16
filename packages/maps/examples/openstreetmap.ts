import { searchOpenStreetMap } from '@repo/maps';

async function osmExample() {
  console.log('=== OpenStreetMap Example ===\n');

  const results = await searchOpenStreetMap({
    category: 'cafe',
    location: 'San Francisco',
    limit: 15,
  });

  console.log(`Found ${results.length} cafes in San Francisco\n`);

  results.slice(0, 5).forEach((business, i) => {
    console.log(`${i + 1}. ${business.name}`);
    console.log(`   Address: ${business.address || 'N/A'}`);
    console.log(`   Phone: ${business.phone || 'N/A'}`);
    console.log(`   Website: ${business.website || 'N/A'}`);
    console.log(`   Hours: ${business.openingHours || 'N/A'}`);
    console.log(
      `   Coordinates: ${business.coordinates ? `${business.coordinates.lat}, ${business.coordinates.lng}` : 'N/A'}`
    );
    console.log('');
  });
}

async function osmByTagsExample() {
  console.log('\n=== OpenStreetMap Custom Tags Example ===\n');

  const { searchByOverpassTags } = await import('@repo/maps');

  const bbox = {
    south: 37.7,
    west: -122.5,
    north: 37.8,
    east: -122.4,
  };

  const results = await searchByOverpassTags(
    { amenity: 'restaurant', cuisine: 'italian' },
    bbox
  );

  console.log(`Found ${results.length} Italian restaurants\n`);

  results.slice(0, 3).forEach((business, i) => {
    console.log(`${i + 1}. ${business.name}`);
    console.log(`   Address: ${business.address || 'N/A'}`);
    console.log(`   Category: ${business.category || 'N/A'}`);
    console.log('');
  });
}

osmExample()
  .then(() => osmByTagsExample())
  .catch(console.error);
