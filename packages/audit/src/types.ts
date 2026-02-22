import { z } from 'zod';

export const TechnologySchema = z.object({
  name: z.string(),
  category: z.string(),
  version: z.string().optional(),
  confidence: z.number().min(0).max(100),
  website: z.string().optional(),
});

export const SSLInfoSchema = z.object({
  valid: z.boolean(),
  validFrom: z.date().optional(),
  validTo: z.date().optional(),
  daysRemaining: z.number().optional(),
  issuer: z.string().optional(),
  protocol: z.string().optional(),
  error: z.string().optional(),
});

export const PerformanceMetricsSchema = z.object({
  firstContentfulPaint: z.number().optional(),
  largestContentfulPaint: z.number().optional(),
  totalBlockingTime: z.number().optional(),
  cumulativeLayoutShift: z.number().optional(),
  speedIndex: z.number().optional(),
  timeToInteractive: z.number().optional(),
  performanceScore: z.number().min(0).max(100).optional(),
});

export const SEODataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  ogTitle: z.string().optional(),
  ogDescription: z.string().optional(),
  ogImage: z.string().optional(),
  twitterCard: z.string().optional(),
  canonical: z.string().optional(),
  h1Tags: z.array(z.string()).optional(),
  robotsMeta: z.string().optional(),
  structuredData: z.array(z.record(z.unknown())).optional(),
});

export const CompanyInfoSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  socialMedia: z.object({
    facebook: z.string().optional(),
    twitter: z.string().optional(),
    linkedin: z.string().optional(),
    instagram: z.string().optional(),
    youtube: z.string().optional(),
  }).optional(),
  foundedYear: z.number().optional(),
  industry: z.string().optional(),
  employees: z.string().optional(),
});

export const DomainInfoSchema = z.object({
  domain: z.string(),
  registrar: z.string().optional(),
  createdDate: z.date().optional(),
  expiresDate: z.date().optional(),
  updatedDate: z.date().optional(),
  nameServers: z.array(z.string()).optional(),
  status: z.array(z.string()).optional(),
  organizationName: z.string().optional(),
  organizationCountry: z.string().optional(),
});

export const AuditResultSchema = z.object({
  url: z.string(),
  auditedAt: z.date(),
  domain: DomainInfoSchema.optional(),
  technologies: z.array(TechnologySchema).optional(),
  ssl: SSLInfoSchema.optional(),
  performance: PerformanceMetricsSchema.optional(),
  seo: SEODataSchema.optional(),
  companyInfo: CompanyInfoSchema.optional(),
  screenshots: z.object({
    desktop: z.string().optional(),
    mobile: z.string().optional(),
  }).optional(),
  error: z.string().optional(),
});

export const AuditOptionsSchema = z.object({
  includeDomain: z.boolean().default(true),
  includeTechnologies: z.boolean().default(true),
  includeSSL: z.boolean().default(true),
  includePerformance: z.boolean().default(false),
  includeSEO: z.boolean().default(true),
  includeCompanyInfo: z.boolean().default(true),
  includeScreenshots: z.boolean().default(false),
  timeout: z.number().default(30000),
  userAgent: z.string().optional(),
  maxRetries: z.number().default(3),
  retryDelay: z.number().default(1000),
});

export type Technology = z.infer<typeof TechnologySchema>;
export type SSLInfo = z.infer<typeof SSLInfoSchema>;
export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;
export type SEOData = z.infer<typeof SEODataSchema>;
export type CompanyInfo = z.infer<typeof CompanyInfoSchema>;
export type DomainInfo = z.infer<typeof DomainInfoSchema>;
export type AuditResult = z.infer<typeof AuditResultSchema>;
export type AuditOptions = z.infer<typeof AuditOptionsSchema>;

export class AuditError extends Error {
  

  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    

    super(message);
    this.name = 'AuditError';
  }
}

export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
}
