import dns from 'node:dns/promises';
import { prisma } from '@repo/database';
import type {
  CompanyCreationData,
  CompanyCreationProgress,
  CompanyCreationResult,
  CompanyScraperStats,
  ScrapedCompanyCreation,
} from './company-creation.types';
import { scrapeBodacc } from './scrapers/bodacc';
import { scrapeCompaniesHouse } from './scrapers/companies-house';
import { scrapeHandelsregister } from './scrapers/handelsregister';

type ScraperRunner = (limit?: number) => Promise<ScrapedCompanyCreation[]>;

interface ScraperRegistryEntry {
  name: string;
  country: 'FR' | 'GB' | 'DE';
  fn: ScraperRunner;
}

const SCRAPERS: ScraperRegistryEntry[] = [
  { name: 'BODACC', country: 'FR', fn: scrapeBodacc },
  { name: 'CompaniesHouse', country: 'GB', fn: scrapeCompaniesHouse },
  { name: 'Handelsregister', country: 'DE', fn: scrapeHandelsregister },
];

function cleanCompanyNameForDns(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(limited|ltd|sarl|sas|sasu|sci|gmbh|ug|ag|inc|llc|co|holding|holdings|services?|cie)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function resolveDomainA(domain: string, timeoutMs = 1500): Promise<boolean> {
  const timeoutPromise = new Promise<boolean>((_, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    timer.unref?.();
  });

  const dnsPromise = dns
    .resolve4(domain)
    .then((addrs) => Array.isArray(addrs) && addrs.length > 0)
    .catch(() => false);

  try {
    return await Promise.race([dnsPromise, timeoutPromise]);
  } catch {
    return false;
  }
}

async function discoverDomain(
  name: string,
  country: string
): Promise<{ hasWebsite: boolean; domain?: string; websiteUrl?: string }> {
  const cleaned = cleanCompanyNameForDns(name);
  if (!cleaned || cleaned.length < 3 || cleaned.length > 30) {
    return { hasWebsite: false };
  }

  const extensions =
    country === 'FR'
      ? ['.fr', '.com']
      : country === 'GB'
        ? ['.co.uk', '.com']
        : country === 'DE'
          ? ['.de', '.com']
          : ['.com'];

  for (const ext of extensions) {
    const candidate = `${cleaned}${ext}`;
    const exists = await resolveDomainA(candidate);
    if (exists) {
      return {
        hasWebsite: true,
        domain: candidate,
        websiteUrl: `https://${candidate}`,
      };
    }
  }

  return { hasWebsite: false };
}

export class CompanyCreationProcessor {
  async process(
    onProgress?: (progress: CompanyCreationProgress) => void,
    data?: CompanyCreationData
  ): Promise<CompanyCreationResult> {
    const start = Date.now();
    const stats: CompanyScraperStats[] = [];
    let totalInserted = 0;
    let totalFound = 0;

    const targetScrapers = SCRAPERS.filter((s) => {
      if (!data?.countries || data.countries.length === 0) {
        return true;
      }
      return data.countries.includes(s.country);
    });

    onProgress?.({
      percent: 0,
      source: targetScrapers[0]?.name ?? 'None',
      sourcesDone: 0,
      sourcesTotal: targetScrapers.length,
      totalInserted: 0,
      totalFound: 0,
    });

    for (let i = 0; i < targetScrapers.length; i++) {
      const scraper = targetScrapers[i];
      const stat = await this.runScraper(scraper, data?.limit);
      stats.push(stat);
      totalFound += stat.found;
      totalInserted += stat.inserted;

      onProgress?.({
        percent: Math.round(((i + 1) / targetScrapers.length) * 100),
        source: targetScrapers[i + 1]?.name ?? scraper.name,
        sourcesDone: i + 1,
        sourcesTotal: targetScrapers.length,
        totalInserted,
        totalFound,
      });
    }

    return {
      stats,
      totalInserted,
      totalFound,
      durationMs: Date.now() - start,
    };
  }

  private async runScraper(
    scraper: ScraperRegistryEntry,
    limit?: number
  ): Promise<CompanyScraperStats> {
    const stat: CompanyScraperStats = {
      source: scraper.name,
      country: scraper.country,
      found: 0,
      inserted: 0,
      skipped: 0,
    };

    try {
      const companies = await scraper.fn(limit);
      stat.found = companies.length;

      for (const company of companies) {
        try {
          await this.upsertCompany(company);
          stat.inserted++;
        } catch (err: any) {
          if (err?.code === 'P2002') {
            stat.skipped++;
          } else {
            console.error(`[CompanyCreation:${scraper.name}] Upsert error:`, err?.message);
            stat.skipped++;
          }
        }
      }
    } catch (err: any) {
      stat.error = err?.message ?? 'Unknown scraper error';
      console.error(`[CompanyCreation:${scraper.name}] Scraper execution failed:`, err?.message);
    }

    return stat;
  }

  private async upsertCompany(company: ScrapedCompanyCreation): Promise<void> {
    const existing = await prisma.companyCreation.findUnique({
      where: { registrationId: company.registrationId },
      select: { id: true, hasWebsite: true, domain: true, websiteUrl: true },
    });

    let webInfo = {
      hasWebsite: company.hasWebsite ?? false,
      domain: company.domain ?? null,
      websiteUrl: company.websiteUrl ?? null,
    };

    if (!existing || (!existing.hasWebsite && !existing.domain)) {
      const discovered = await discoverDomain(company.name, company.country);
      if (discovered.hasWebsite) {
        webInfo = {
          hasWebsite: true,
          domain: discovered.domain ?? null,
          websiteUrl: discovered.websiteUrl ?? null,
        };
      }
    } else if (existing.hasWebsite) {
      webInfo = {
        hasWebsite: existing.hasWebsite,
        domain: existing.domain,
        websiteUrl: existing.websiteUrl,
      };
    }

    await prisma.companyCreation.upsert({
      where: { registrationId: company.registrationId },
      create: {
        country: company.country,
        registrationId: company.registrationId,
        name: company.name,
        legalForm: company.legalForm ?? null,
        activityCode: company.activityCode ?? null,
        activityLabel: company.activityLabel ?? null,
        address: company.address ?? null,
        city: company.city ?? null,
        postalCode: company.postalCode ?? null,
        region: company.region ?? null,
        capital: company.capital ?? null,
        currency: company.currency ?? 'EUR',
        directors: (company.directors ?? null) as any,
        sourceUrl: company.sourceUrl ?? null,
        publishedAt: company.publishedAt,
        hasWebsite: webInfo.hasWebsite,
        domain: webInfo.domain,
        websiteUrl: webInfo.websiteUrl,
        email: company.email ?? null,
        phone: company.phone ?? null,
        enrichmentStatus: 'PENDING',
      },
      update: {
        name: company.name,
        legalForm: company.legalForm ?? undefined,
        activityCode: company.activityCode ?? undefined,
        activityLabel: company.activityLabel ?? undefined,
        address: company.address ?? undefined,
        city: company.city ?? undefined,
        postalCode: company.postalCode ?? undefined,
        region: company.region ?? undefined,
        capital: company.capital ?? undefined,
        currency: company.currency ?? undefined,
        directors: company.directors ? ((company.directors) as any) : undefined,
        sourceUrl: company.sourceUrl ?? undefined,
        ...(webInfo.hasWebsite
          ? {
              hasWebsite: true,
              domain: webInfo.domain,
              websiteUrl: webInfo.websiteUrl,
            }
          : {}),
        updatedAt: new Date(),
      },
    });
  }
}
