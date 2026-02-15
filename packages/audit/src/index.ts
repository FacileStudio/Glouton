export { WebsiteAuditor, auditWebsite, auditWebsiteFromHtml, auditWebsites } from './auditor';

export type {
  Technology,
  SSLInfo,
  PerformanceMetrics,
  SEOData,
  CompanyInfo,
  DomainInfo,
  AuditResult,
  AuditOptions,
  RateLimiterConfig,
} from './types';

export {
  TechnologySchema,
  SSLInfoSchema,
  PerformanceMetricsSchema,
  SEODataSchema,
  CompanyInfoSchema,
  DomainInfoSchema,
  AuditResultSchema,
  AuditOptionsSchema,
  AuditError,
} from './types';

export { detectTechnologies } from './analyzers/technology';
export { analyzeSSL, analyzeSecurityHeaders, calculateSecurityScore } from './analyzers/security';
export type { SecurityHeaders, SecurityScore } from './analyzers/security';
export { analyzeSEO, calculateSEOScore, analyzeContent } from './analyzers/seo';
export type { SEOScore, ContentAnalysis } from './analyzers/seo';
export { extractCompanyInfo, calculateCompanyInfoScore } from './analyzers/company-info';
export type { CompanyScore } from './analyzers/company-info';

export { HttpClient, normalizeUrl, extractDomain, isValidUrl } from './utils/http';
export {
  parseHtml,
  extractEmails,
  extractPhones,
  extractSocialLinks,
  extractStructuredData,
  extractMetaTag,
  cleanText,
  extractYear,
  extractAddress,
  findAboutPage,
  findContactPage,
} from './utils/parser';
