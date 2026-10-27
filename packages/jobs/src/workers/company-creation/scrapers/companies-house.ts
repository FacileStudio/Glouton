import type { ScrapedCompanyCreation } from '../company-creation.types';

interface CompaniesHouseAdvancedItem {
  company_name: string;
  company_number: string;
  company_status?: string;
  company_type?: string;
  date_of_creation?: string;
  sic_codes?: string[];
  registered_office_address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    postal_code?: string;
    region?: string;
    country?: string;
  };
}

interface CompaniesHouseApiResponse {
  items?: CompaniesHouseAdvancedItem[];
}

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseUkDate(dateStr: string): Date {
  const cleaned = dateStr.replace(/-.*/, '').trim();
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  return new Date();
}

function extractPostalCode(address: string): string | undefined {
  const match = address.match(/\b[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}\b/i);
  return match ? match[0].toUpperCase() : undefined;
}

function extractCityFromAddress(address: string): string | undefined {
  const parts = address.split(',').map((p) => p.trim());
  if (parts.length >= 3) {
    const candidate = parts[parts.length - 3];
    if (candidate && !/england|scotland|wales|united kingdom/i.test(candidate)) {
      return candidate;
    }
  }
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 2];
    if (candidate && !/england|scotland|wales|united kingdom/i.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function scrapeWithApiKey(apiKey: string, limit = 100): Promise<ScrapedCompanyCreation[]> {
  const url = `https://api.company-information.service.gov.uk/advanced-search/companies?company_status=active&size=${Math.min(limit, 100)}`;
  const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Companies House API returned HTTP ${res.status}`);
    }

    const data = (await res.json()) as CompaniesHouseApiResponse;
    const items = data.items || [];

    return items.map((item) => {
      const addr = item.registered_office_address;
      const streetParts = [addr?.address_line_1, addr?.address_line_2].filter(Boolean);
      const address = streetParts.length > 0 ? streetParts.join(', ') : undefined;
      const publishedAt = item.date_of_creation ? new Date(item.date_of_creation) : new Date();

      return {
        country: 'GB',
        registrationId: item.company_number,
        name: decodeHtml(item.company_name),
        legalForm: item.company_type || 'ltd',
        activityCode: item.sic_codes?.[0] || undefined,
        activityLabel: item.sic_codes && item.sic_codes.length > 0 ? `SIC ${item.sic_codes.join(', ')}` : undefined,
        address,
        city: addr?.locality,
        postalCode: addr?.postal_code,
        region: addr?.region,
        currency: 'GBP',
        publishedAt,
        sourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${item.company_number}`,
      };
    });
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeWithPublicSearch(limit = 100): Promise<ScrapedCompanyCreation[]> {
  const queries = ['ltd', 'limited', 'services', 'technologies', 'consulting'];
  const seenNumbers = new Set<string>();
  const results: ScrapedCompanyCreation[] = [];

  for (const q of queries) {
    if (results.length >= limit) {
      break;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(`https://find-and-update.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      if (!res.ok) {
        continue;
      }

      const html = await res.text();
      const regex = /<li class="type-company">[\s\S]*?<a class="govuk-link" href="\/company\/([0-9A-Z]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>[\s\S]*?<p class="meta crumbtrail">\s*([0-9A-Z]+)\s*-\s*Incorporated on\s*([^<]+)<\/p>(?:[\s\S]*?<p>([^<]+)<\/p>)?/g;

      let match: RegExpExecArray | null;
      while ((match = regex.exec(html)) !== null) {
        const number = match[1];
        if (!number || seenNumbers.has(number)) {
          continue;
        }
        seenNumbers.add(number);

        const rawName = match[2];
        const rawDate = match[4];
        const rawAddress = match[5]?.trim();

        const name = decodeHtml(rawName);
        const publishedAt = parseUkDate(rawDate);
        const postalCode = rawAddress ? extractPostalCode(rawAddress) : undefined;
        const city = rawAddress ? extractCityFromAddress(rawAddress) : undefined;

        results.push({
          country: 'GB',
          registrationId: number,
          name,
          legalForm: 'Private Limited Company',
          address: rawAddress,
          city,
          postalCode,
          currency: 'GBP',
          publishedAt,
          sourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${number}`,
        });

        if (results.length >= limit) {
          break;
        }
      }
    } catch (err) {
      console.warn(`[CompaniesHouse] Public search failed for query "${q}":`, err instanceof Error ? err.message : err);
    } finally {
      clearTimeout(timer);
    }
  }

  return results;
}

export async function scrapeCompaniesHouse(limit = 100): Promise<ScrapedCompanyCreation[]> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;

  if (apiKey && apiKey.trim().length > 0) {
    try {
      return await scrapeWithApiKey(apiKey.trim(), limit);
    } catch (err) {
      console.warn('[CompaniesHouse] API key search failed, falling back to public search:', err instanceof Error ? err.message : err);
    }
  }

  return scrapeWithPublicSearch(limit);
}
