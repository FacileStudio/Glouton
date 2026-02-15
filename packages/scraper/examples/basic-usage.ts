import { scrapeWebsite, WebScraper, scrapeWebsites } from '../src/index';

/**
 * basicExample
 */
async function basicExample() {
  console.log('Basic scraping example...');

  const data = await scrapeWebsite('https://example.com', {
    timeout: 30000,
    followContactPage: true,
    followAboutPage: true,
  });

  console.log('Scraped Data:', {
    url: data.url,
    emails: data.contact.emails,
    phones: data.contact.phones,
    addresses: data.contact.addresses,
    socialProfiles: data.contact.socialProfiles,
    companyInfo: data.companyInfo,
  });
}

/**
 * advancedExample
 */
async function advancedExample() {
  console.log('Advanced scraping with custom configuration...');

  const scraper = new WebScraper({
    timeout: 30000,
    maxRetries: 3,
    minDelay: 3000,
    maxDelay: 6000,
    headless: true,
    followContactPage: true,
    followAboutPage: true,
  });

  try {
    await scraper.initialize();

    const data1 = await scraper.scrape('https://example1.com');
    console.log('Site 1 - Emails:', data1.contact.emails);

    const data2 = await scraper.scrape('https://example2.com');
    console.log('Site 2 - Emails:', data2.contact.emails);
  } finally {
    await scraper.close();
  }
}

/**
 * multipleWebsitesExample
 */
async function multipleWebsitesExample() {
  console.log('Scraping multiple websites...');

  const urls = [
    'https://example1.com',
    'https://example2.com',
    'https://example3.com',
  ];

  const results = await scrapeWebsites(urls, {
    minDelay: 4000,
    maxDelay: 7000,
    headless: true,
  });

  /**
   * for
   */
  for (const [url, data] of results) {
    console.log(`${url}:`, {
      emails: data.contact.emails.length,
      phones: data.contact.phones.length,
      social: data.contact.socialProfiles.length,
    });
  }
}

/**
 * extractorsExample
 */
async function extractorsExample() {
  console.log('Using individual extractors...');

  const html = `
    <html>
      <body>
        <p>Contact us at info@example.com or call (555) 123-4567</p>
        <a href="https://linkedin.com/company/example">LinkedIn</a>
        <a href="https://twitter.com/example">Twitter</a>
      </body>
    </html>
  `;

  const { extractEmails, extractPhones, extractSocialProfiles } = await import('../src/index');

  const emails = extractEmails(html);
  const phones = extractPhones(html);
  const socialProfiles = extractSocialProfiles(html);

  console.log('Extracted:', { emails, phones, socialProfiles });
}

/**
 * main
 */
async function main() {
  try {
    await extractorsExample();
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * main
 */
main();
