import whois from 'whois-json';
import type {
  AuditResult,
  AuditOptions,
  DomainInfo,
  Technology,
  SSLInfo,
  SEOData,
  CompanyInfo,
} from './types';
import { AuditError, AuditOptionsSchema } from './types';
import { HttpClient, normalizeUrl, extractDomain } from './utils/http';
import { parseHtml } from './utils/parser';
import { detectTechnologies } from './analyzers/technology';
import { analyzeSSL } from './analyzers/security';
import { analyzeSEO } from './analyzers/seo';
import { extractCompanyInfo } from './analyzers/company-info';

export class WebsiteAuditor {
  private httpClient: HttpClient;

  

  constructor(
    timeout: number = 30000,
    userAgent?: string,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ) {
    this.httpClient = new HttpClient(timeout, userAgent, maxRetries, retryDelay);
  }

  

  async audit(url: string, options?: Partial<AuditOptions>): Promise<AuditResult> {
    const validatedOptions = AuditOptionsSchema.parse(options || {});

    const normalizedUrl = normalizeUrl(url);
    const domain = extractDomain(normalizedUrl);

    const result: AuditResult = {
      url: normalizedUrl,
      auditedAt: new Date(),
    };

    try {
      const [html, headers] = await Promise.all([
        this.httpClient.get(normalizedUrl),
        this.httpClient.head(normalizedUrl).catch(() => ({})),
      ]);

      return this.auditFromHtml(url, html, headers, options);
    } catch (error) {
      result.error = error instanceof AuditError ? error.message : (error as Error).message;
      return result;
    }
  }

  

  async auditFromHtml(
    url: string,
    html: string,
    headers: Record<string, string> = {},
    options?: Partial<AuditOptions>
  ): Promise<AuditResult> {
    const validatedOptions = AuditOptionsSchema.parse(options || {});

    const normalizedUrl = normalizeUrl(url);
    const domain = extractDomain(normalizedUrl);

    const result: AuditResult = {
      url: normalizedUrl,
      auditedAt: new Date(),
    };

    try {
      const $ = parseHtml(html);

      const analysisPromises: Promise<void>[] = [];

      

      if (validatedOptions.includeDomain) {
        analysisPromises.push(
          this.analyzeDomain(domain).then((domainInfo) => {
            result.domain = domainInfo;
          })
        );
      }

      

      if (validatedOptions.includeTechnologies) {
        analysisPromises.push(
          

          detectTechnologies($, html, headers).then((technologies) => {
            result.technologies = technologies;
          })
        );
      }

      

      if (validatedOptions.includeSSL) {
        analysisPromises.push(
          

          analyzeSSL(domain).then((sslInfo) => {
            result.ssl = sslInfo;
          })
        );
      }

      

      if (validatedOptions.includeSEO) {
        const seoData = analyzeSEO($, normalizedUrl);
        result.seo = seoData;
      }

      

      if (validatedOptions.includeCompanyInfo) {
        analysisPromises.push(
          

          extractCompanyInfo($, normalizedUrl, this.httpClient).then((companyInfo) => {
            result.companyInfo = companyInfo;
          })
        );
      }

      await Promise.allSettled(analysisPromises);
    } catch (error) {
      result.error = error instanceof AuditError ? error.message : (error as Error).message;
    }

    return result;
  }

  

  private async analyzeDomain(domain: string): Promise<DomainInfo> {
    try {
      const whoisData = await whois(domain, { follow: 3, timeout: 10000 });

      let createdDate: Date | undefined;
      let expiresDate: Date | undefined;
      let updatedDate: Date | undefined;

      

      if (whoisData.createdDate) {
        const date = new Date(whoisData.createdDate);
        

        if (!isNaN(date.getTime())) {
          createdDate = date;
        }
      }

      

      if (whoisData.expiresDate) {
        const date = new Date(whoisData.expiresDate);
        

        if (!isNaN(date.getTime())) {
          expiresDate = date;
        }
      }

      

      if (whoisData.updatedDate) {
        const date = new Date(whoisData.updatedDate);
        

        if (!isNaN(date.getTime())) {
          updatedDate = date;
        }
      }

      return {
        domain,
        registrar: whoisData.registrar,
        createdDate,
        expiresDate,
        updatedDate,
        nameServers: Array.isArray(whoisData.nameServers)
          ? whoisData.nameServers
          : whoisData.nameServers
            ? [whoisData.nameServers]
            : undefined,
        status: Array.isArray(whoisData.status)
          ? whoisData.status
          : whoisData.status
            ? [whoisData.status]
            : undefined,
        organizationName: whoisData.organizationName,
        organizationCountry: whoisData.organizationCountry,
      };
    } catch (error) {
      return {
        domain,
      };
    }
  }

  

  async batchAudit(
    urls: string[],
    options?: Partial<AuditOptions>,
    concurrency: number = 3
  ): Promise<AuditResult[]> {
    const results: AuditResult[] = [];
    const chunks: string[][] = [];

    

    for (let i = 0; i < urls.length; i += concurrency) {
      chunks.push(urls.slice(i, i + concurrency));
    }

    

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map((url) =>
          this.audit(url, options).catch((error) => ({
            url,
            auditedAt: new Date(),
            error: error instanceof AuditError ? error.message : (error as Error).message,
          }))
        )
      );
      results.push(...chunkResults);
    }

    return results;
  }

  

  setRateLimitConfig(maxRequests: number, windowMs: number): void {
    this.httpClient.setRateLimitConfig({ maxRequests, windowMs });
  }
}



export async function auditWebsite(
  url: string,
  options?: Partial<AuditOptions>
): Promise<AuditResult> {
  const auditor = new WebsiteAuditor(
    options?.timeout,
    options?.userAgent,
    options?.maxRetries,
    options?.retryDelay
  );
  return auditor.audit(url, options);
}



export async function auditWebsiteFromHtml(
  url: string,
  html: string,
  headers: Record<string, string> = {},
  options?: Partial<AuditOptions>
): Promise<AuditResult> {
  const auditor = new WebsiteAuditor(
    options?.timeout,
    options?.userAgent,
    options?.maxRetries,
    options?.retryDelay
  );
  return auditor.auditFromHtml(url, html, headers, options);
}



export async function auditWebsites(
  urls: string[],
  options?: Partial<AuditOptions>,
  concurrency: number = 3
): Promise<AuditResult[]> {
  const auditor = new WebsiteAuditor(
    options?.timeout,
    options?.userAgent,
    options?.maxRetries,
    options?.retryDelay
  );
  return auditor.batchAudit(urls, options, concurrency);
}
