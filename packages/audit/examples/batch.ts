import { auditWebsites } from '../src/index';



async function batchExample() {
  console.log('Starting batch website audit...\n');

  const urls = [
    'https://www.shopify.com',
    'https://www.stripe.com',
    'https://vercel.com',
  ];

  try {
    const results = await auditWebsites(
      urls,
      {
        includeTechnologies: true,
        includeSEO: true,
        includeCompanyInfo: true,
        timeout: 30000,
      },
      2
    );

    console.log(`\n=== Audited ${results.length} websites ===\n`);

    results.forEach((result, index) => {
      console.log(`\n[${index + 1}] ${result.url}`);

      

      if (result.error) {
        console.log('   ERROR:', result.error);
        return;
      }

      

      if (result.technologies && result.technologies.length > 0) {
        const techNames = result.technologies.slice(0, 5).map((t) => t.name);
        console.log('   Technologies:', techNames.join(', '));
      }

      

      if (result.companyInfo?.name) {
        console.log('   Company:', result.companyInfo.name);
      }

      

      if (result.companyInfo?.email) {
        console.log('   Email:', result.companyInfo.email);
      }

      

      if (result.seo?.title) {
        console.log('   Title:', result.seo.title.substring(0, 60));
      }
    });
  } catch (error) {
    console.error('Error during batch audit:', error);
  }
}



batchExample();
