import { auditWebsite, type AuditResult } from '../src/index';



async function basicExample() {
  console.log('Starting website audit...\n');

  try {
    const result: AuditResult = await auditWebsite('https://www.shopify.com', {
      includeDomain: true,
      includeTechnologies: true,
      includeSSL: true,
      includeSEO: true,
      includeCompanyInfo: true,
      timeout: 30000,
      maxRetries: 3,
    });

    console.log('=== Audit Result ===');
    console.log('URL:', result.url);
    console.log('Audited at:', result.auditedAt);

    

    if (result.domain) {
      console.log('\n--- Domain Information ---');
      console.log('Domain:', result.domain.domain);
      console.log('Registrar:', result.domain.registrar);
      console.log('Created:', result.domain.createdDate);
      console.log('Expires:', result.domain.expiresDate);
    }

    

    if (result.technologies && result.technologies.length > 0) {
      console.log('\n--- Technologies Detected ---');
      result.technologies.forEach((tech) => {
        console.log(`- ${tech.name} (${tech.category}) - Confidence: ${tech.confidence}%`);
        

        if (tech.version) {
          console.log(`  Version: ${tech.version}`);
        }
      });
    }

    

    if (result.ssl) {
      console.log('\n--- SSL Information ---');
      console.log('Valid:', result.ssl.valid);
      console.log('Issuer:', result.ssl.issuer);
      console.log('Days remaining:', result.ssl.daysRemaining);
    }

    

    if (result.seo) {
      console.log('\n--- SEO Data ---');
      console.log('Title:', result.seo.title);
      console.log('Description:', result.seo.description);
      console.log('H1 Tags:', result.seo.h1Tags?.length || 0);
      console.log('Open Graph Title:', result.seo.ogTitle);
    }

    

    if (result.companyInfo) {
      console.log('\n--- Company Information ---');
      console.log('Name:', result.companyInfo.name);
      console.log('Email:', result.companyInfo.email);
      console.log('Phone:', result.companyInfo.phone);
      console.log('Address:', result.companyInfo.address);
      

      if (result.companyInfo.socialMedia) {
        console.log('Social Media:');
        Object.entries(result.companyInfo.socialMedia).forEach(([platform, url]) => {
          console.log(`  ${platform}: ${url}`);
        });
      }
    }

    

    if (result.error) {
      console.log('\n--- Error ---');
      console.log(result.error);
    }
  } catch (error) {
    console.error('Error during audit:', error);
  }
}



basicExample();
