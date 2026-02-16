import { searchBusinesses } from '@repo/maps';
import { writeFileSync } from 'fs';

interface Lead {
  name: string;
  phone: string;
  address?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  source: string;
  coordinates?: { lat: number; lng: number };
}

async function generateLeads(
  city: string,
  category: string,
  minRating: number = 0
): Promise<Lead[]> {
  console.log(`Searching for ${category} in ${city}...\n`);

  const results = await searchBusinesses({
    category: category as any,
    location: city,
    hasWebsite: false,
    source: 'all',
    limit: 200,
  });

  console.log(`Found ${results.totalCount} businesses without websites`);

  const leads = results.businesses
    .filter((b) => b.phone && (!minRating || (b.rating && b.rating >= minRating)))
    .map((b) => ({
      name: b.name,
      phone: b.phone!,
      address: b.address,
      category: b.category,
      rating: b.rating,
      reviewCount: b.reviewCount,
      source: b.source,
      coordinates: b.coordinates,
    }));

  console.log(`Filtered to ${leads.length} qualified leads (with phone, rating >= ${minRating})\n`);

  return leads;
}

async function exportLeadsToCSV(leads: Lead[], filename: string): Promise<void> {
  const csv = [
    'Name,Phone,Address,Category,Rating,Reviews,Source,Latitude,Longitude',
    ...leads.map((lead) =>
      [
        `"${lead.name.replace(/"/g, '""')}"`,
        lead.phone,
        `"${(lead.address || '').replace(/"/g, '""')}"`,
        lead.category || '',
        lead.rating || '',
        lead.reviewCount || '',
        lead.source,
        lead.coordinates?.lat || '',
        lead.coordinates?.lng || '',
      ].join(',')
    ),
  ].join('\n');

  writeFileSync(filename, csv);
  console.log(`Exported ${leads.length} leads to ${filename}`);
}

async function batchLeadGeneration() {
  const campaigns = [
    { city: 'Brooklyn', category: 'restaurant', minRating: 4.0 },
    { city: 'Austin', category: 'cafe', minRating: 4.0 },
    { city: 'Seattle', category: 'retail', minRating: 3.5 },
  ];

  const allLeads: (Lead & { city: string })[] = [];

  for (const campaign of campaigns) {
    console.log(`\n=== Campaign: ${campaign.category} in ${campaign.city} ===`);

    const leads = await generateLeads(campaign.city, campaign.category, campaign.minRating);

    allLeads.push(...leads.map((lead) => ({ ...lead, city: campaign.city })));

    console.log(`Sample leads from ${campaign.city}:`);
    leads.slice(0, 3).forEach((lead, i) => {
      console.log(`  ${i + 1}. ${lead.name}`);
      console.log(`     Phone: ${lead.phone}`);
      console.log(`     Rating: ${lead.rating || 'N/A'} (${lead.reviewCount || 0} reviews)`);
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total leads generated: ${allLeads.length}`);

  const byCity = allLeads.reduce(
    (acc, lead) => {
      acc[lead.city] = (acc[lead.city] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log('Leads by city:');
  Object.entries(byCity).forEach(([city, count]) => {
    console.log(`  ${city}: ${count}`);
  });

  await exportLeadsToCSV(allLeads, 'leads.csv');
}

batchLeadGeneration().catch(console.error);
