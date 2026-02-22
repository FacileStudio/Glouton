import type { CheerioAPI } from 'cheerio';
import type { CompanyInfo } from '../types';
import type { HttpClient } from '../utils/http';
import {
  parseHtml,
  extractEmails,
  extractPhones,
  extractSocialLinks,
  extractStructuredData,
  cleanText,
  extractYear,
  extractAddress,
  findAboutPage,
  findContactPage,
  findTeamPage,
  findSpeculativePaths,
} from '../utils/parser';



export async function extractCompanyInfo(
  $: CheerioAPI,
  url: string,
  httpClient: HttpClient
): Promise<CompanyInfo> {
  const companyInfo: CompanyInfo = {};

  const pageText = $('body').text();

  const emails = extractEmails(pageText);
  

  if (emails.length > 0) {
    companyInfo.email = emails[0];
  }

  const phones = extractPhones(pageText);
  

  if (phones.length > 0) {
    companyInfo.phone = phones[0];
  }

  const socialMedia = extractSocialLinks($);
  

  if (Object.keys(socialMedia).length > 0) {
    companyInfo.socialMedia = socialMedia;
  }

  const address = extractAddress($);
  

  if (address) {
    companyInfo.address = address;
  }

  

  extractFromStructuredData($, companyInfo);

  

  extractFromMetaTags($, companyInfo);

  let aboutUrl = findAboutPage($, url);
  let contactUrl = findContactPage($, url);
  let teamUrl = findTeamPage($, url);

  const speculativePaths = await findSpeculativePaths(url, httpClient);

  if (!aboutUrl && speculativePaths.about) {
    aboutUrl = speculativePaths.about;
  }
  if (!contactUrl && speculativePaths.contact) {
    contactUrl = speculativePaths.contact;
  }
  if (!teamUrl && speculativePaths.team) {
    teamUrl = speculativePaths.team;
  }

  const pagePromises: Promise<void>[] = [];

  if (aboutUrl) {
    pagePromises.push(
      httpClient.get(aboutUrl)
        .then((aboutHtml: string) => {
          const $about = parseHtml(aboutHtml);
          extractFromAboutPage($about, companyInfo);
        })
        .catch(() => {})
    );
  }

  if (contactUrl && contactUrl !== aboutUrl) {
    pagePromises.push(
      httpClient.get(contactUrl)
        .then((contactHtml: string) => {
          const $contact = parseHtml(contactHtml);
          extractFromContactPage($contact, companyInfo);
        })
        .catch(() => {})
    );
  }

  if (teamUrl && teamUrl !== aboutUrl && teamUrl !== contactUrl) {
    pagePromises.push(
      httpClient.get(teamUrl)
        .then((teamHtml: string) => {
          const $team = parseHtml(teamHtml);
          extractFromTeamPage($team, companyInfo);
        })
        .catch(() => {})
    );
  }

  await Promise.allSettled(pagePromises);

  return companyInfo;
}



function extractFromStructuredData($: CheerioAPI, companyInfo: CompanyInfo): void {
  const structuredData = extractStructuredData($);

  

  for (const data of structuredData) {
    

    if (data['@type'] === 'Organization' || data['@type'] === 'LocalBusiness') {
      

      if (data.name && !companyInfo.name) {
        companyInfo.name = String(data.name);
      }
      

      if (data.description && !companyInfo.description) {
        companyInfo.description = String(data.description);
      }
      

      if (data.email && !companyInfo.email) {
        companyInfo.email = String(data.email);
      }
      

      if (data.telephone && !companyInfo.phone) {
        companyInfo.phone = String(data.telephone);
      }

      

      if (data.address && typeof data.address === 'object') {
        const addr = data.address as Record<string, unknown>;
        

        if (addr.streetAddress && !companyInfo.address) {
          const parts = [
            addr.streetAddress,
            addr.addressLocality,
            addr.addressRegion,
            addr.postalCode,
            addr.addressCountry,
          ].filter(Boolean);
          companyInfo.address = parts.join(', ');
        }
      }

      

      if (data.foundingDate && !companyInfo.foundedYear) {
        const year = extractYear(String(data.foundingDate));
        

        if (year) {
          companyInfo.foundedYear = year;
        }
      }
    }
  }
}



function extractFromMetaTags($: CheerioAPI, companyInfo: CompanyInfo): void {
  const ogSiteName = $('meta[property="og:site_name"]').attr('content');
  

  if (ogSiteName && !companyInfo.name) {
    companyInfo.name = ogSiteName.trim();
  }

  const ogDescription = $('meta[property="og:description"]').attr('content');
  

  if (ogDescription && !companyInfo.description) {
    companyInfo.description = ogDescription.trim();
  }

  const metaDescription = $('meta[name="description"]').attr('content');
  

  if (metaDescription && !companyInfo.description) {
    companyInfo.description = metaDescription.trim();
  }
}



function extractFromAboutPage($: CheerioAPI, companyInfo: CompanyInfo): void {
  const pageText = $('body').text();

  

  if (!companyInfo.name) {
    const h1 = $('h1').first().text().trim();
    

    if (h1 && h1.length < 100) {
      companyInfo.name = h1;
    }
  }

  

  if (!companyInfo.description) {
    const mainContent = $('main, article, .content, #content').first();
    

    if (mainContent.length) {
      const firstP = mainContent.find('p').first().text().trim();
      

      if (firstP && firstP.length > 50 && firstP.length < 500) {
        companyInfo.description = firstP;
      }
    }
  }

  const foundedPatterns = [
    /founded\s+in\s+(\d{4})/i,
    /established\s+in\s+(\d{4})/i,
    /since\s+(\d{4})/i,
    /started\s+in\s+(\d{4})/i,
  ];

  

  for (const pattern of foundedPatterns) {
    const match = pageText.match(pattern);
    

    if (match && match[1]) {
      const year = Number.parseInt(match[1], 10);
      const currentYear = new Date().getFullYear();
      

      if (year >= 1800 && year <= currentYear && !companyInfo.foundedYear) {
        companyInfo.foundedYear = year;
        break;
      }
    }
  }

  const industryPatterns = [
    /industry:\s*([^<\n.]+)/i,
    /we\s+(?:are|specialize in|focus on)\s+([^<\n.]+\s+(?:industry|sector|business))/i,
  ];

  

  for (const pattern of industryPatterns) {
    const match = pageText.match(pattern);
    

    if (match && match[1]) {
      const industry = cleanText(match[1]);
      

      if (industry.length > 3 && industry.length < 100 && !companyInfo.industry) {
        companyInfo.industry = industry;
        break;
      }
    }
  }

  const employeePatterns = [
    /(\d+[\+\-\s]*(?:to|–|-)?\s*\d*)\s+employees/i,
    /team\s+of\s+(\d+[\+\-\s]*(?:to|–|-)?\s*\d*)\s+(?:people|professionals|members)/i,
  ];

  

  for (const pattern of employeePatterns) {
    const match = pageText.match(pattern);
    

    if (match && match[1]) {
      

      if (!companyInfo.employees) {
        companyInfo.employees = match[1].trim();
        break;
      }
    }
  }

  

  if (!companyInfo.email) {
    const emails = extractEmails(pageText);
    

    if (emails.length > 0) {
      companyInfo.email = emails[0];
    }
  }

  

  if (!companyInfo.phone) {
    const phones = extractPhones(pageText);
    

    if (phones.length > 0) {
      companyInfo.phone = phones[0];
    }
  }

  

  if (!companyInfo.socialMedia || Object.keys(companyInfo.socialMedia).length === 0) {
    const social = extractSocialLinks($);
    

    if (Object.keys(social).length > 0) {
      companyInfo.socialMedia = social;
    }
  }
}



function extractFromContactPage($: CheerioAPI, companyInfo: CompanyInfo): void {
  const pageText = $('body').text();

  

  if (!companyInfo.email) {
    const emails = extractEmails(pageText);
    

    if (emails.length > 0) {
      companyInfo.email = emails[0];
    }
  }

  

  if (!companyInfo.phone) {
    const phones = extractPhones(pageText);
    

    if (phones.length > 0) {
      companyInfo.phone = phones[0];
    }
  }

  

  if (!companyInfo.address) {
    const address = extractAddress($);
    

    if (address) {
      companyInfo.address = address;
    }
  }

  

  if (!companyInfo.socialMedia || Object.keys(companyInfo.socialMedia).length === 0) {
    const social = extractSocialLinks($);
    

    if (Object.keys(social).length > 0) {
      companyInfo.socialMedia = social;
    }
  }
}



function extractFromTeamPage($: CheerioAPI, companyInfo: CompanyInfo): void {
  const pageText = $('body').text();

  if (!companyInfo.email) {
    const emails = extractEmails(pageText);
    if (emails.length > 0) {
      companyInfo.email = emails[0];
    }
  }

  if (!companyInfo.socialMedia || Object.keys(companyInfo.socialMedia).length === 0) {
    const social = extractSocialLinks($);
    if (Object.keys(social).length > 0) {
      companyInfo.socialMedia = social;
    }
  }

  if (!companyInfo.employees) {
    const teamMembers = $('.team-member, .person, [class*="team"], [class*="member"]').length;
    if (teamMembers > 0 && teamMembers < 500) {
      companyInfo.employees = `~${teamMembers}`;
    }
  }
}

export interface CompanyScore {
  completeness: number;
  missingFields: string[];
}



export function calculateCompanyInfoScore(companyInfo: CompanyInfo): CompanyScore {
  const fields = [
    { name: 'name', value: companyInfo.name },
    { name: 'description', value: companyInfo.description },
    { name: 'email', value: companyInfo.email },
    { name: 'phone', value: companyInfo.phone },
    { name: 'address', value: companyInfo.address },
    { name: 'socialMedia', value: companyInfo.socialMedia },
    { name: 'foundedYear', value: companyInfo.foundedYear },
    { name: 'industry', value: companyInfo.industry },
    { name: 'employees', value: companyInfo.employees },
  ];

  const totalFields = fields.length;
  let filledFields = 0;
  const missingFields: string[] = [];

  

  for (const field of fields) {
    

    if (field.value) {
      

      if (typeof field.value === 'object') {
        

        if (Object.keys(field.value).length > 0) {
          filledFields++;
        } else {
          missingFields.push(field.name);
        }
      } else {
        filledFields++;
      }
    } else {
      missingFields.push(field.name);
    }
  }

  const completeness = Math.round((filledFields / totalFields) * 100);

  return {
    completeness,
    missingFields,
  };
}
