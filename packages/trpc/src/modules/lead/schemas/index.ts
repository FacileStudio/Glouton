import { z } from 'zod';

export const leadSourceSchema = z.enum(['HUNTER', 'MANUAL']);

export const hunterFiltersSchema = z.object({
  type: z.enum(['personal', 'generic']).optional(),
  seniority: z.array(z.enum(['junior', 'senior', 'executive'])).optional(),
  department: z.array(z.string()).optional(),
  jobTitles: z.array(z.string()).optional(),
  requiredFields: z.array(z.enum(['full_name', 'position', 'phone_number'])).optional(),
  verificationStatus: z.array(z.enum(['valid', 'accept_all', 'unknown'])).optional(),
  location: z.object({
    continent: z.string().optional(),
    businessRegion: z.enum(['AMER', 'EMEA', 'APAC', 'LATAM']).optional(),
    country: z.string().optional(),
    state: z.string().optional(),
    city: z.string().optional(),
  }).optional(),
}).optional();

export const startHuntSchema = z.object({
  source: leadSourceSchema.default('HUNTER'),
  companyName: z.string().optional(),
  speed: z
    .number()
    .int('Speed must be an integer')
    .min(1, 'Speed must be at least 1')
    .max(10, 'Speed must not exceed 10')
    .default(5),
  filters: hunterFiltersSchema,
});

export const businessCategoryEnum = z.enum([
  'restaurant',
  'cafe',
  'bar',
  'hotel',
  'retail',
  'office',
  'service',
  'healthcare',
  'education',
  'entertainment',
  'automotive',
  'real-estate',
  'finance',
  'beauty',
  'fitness',
  'travel',
  'food-delivery',
  'grocery',
  'pharmacy',
  'pet-services',
  'home-services',
  'professional-services',
  'seo-agency',
  'design-agency',
  'web-dev-agency',
  'marketing-agency',
  'other',
]);

export const startLocalBusinessHuntSchema = z.object({
  location: z.string().min(1, 'Location is required'),
  categories: z.array(businessCategoryEnum).min(1, 'At least one category is required'),
  hasWebsite: z.boolean().optional(),
  radius: z.number().int().min(100).max(50000).optional(),
  maxResults: z.number().int().min(1).max(500).optional(),
});

export const listLeadsSchema = z
  .object({
    status: z.enum(['HOT', 'WARM', 'COLD']).optional(),
    search: z.string().optional(),
    country: z.string().optional(),
    city: z.string().optional(),
    category: businessCategoryEnum.optional(),
    businessType: z.enum(['DOMAIN', 'LOCAL_BUSINESS']).optional(),
    contacted: z.boolean().optional(),
    hasWebsite: z.boolean().optional(),
    hasSocial: z.boolean().optional(),
    hasPhone: z.boolean().optional(),
    hasGps: z.boolean().optional(),
    hasEmail: z.boolean().optional(),
    sortBy: z.enum(['domain', 'email', 'city', 'country', 'score', 'status', 'createdAt']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).optional(),
  })
  .optional();

export const huntStatusSchema = z.object({
  huntSessionId: z.string().uuid('Invalid hunt session ID'),
});

export const deleteLeadSchema = z.object({
  leadId: z.string().uuid('Invalid lead ID'),
});

export const getByIdSchema = z.object({
  id: z.string().uuid('Invalid lead ID'),
});

export const cancelHuntSchema = z.object({
  huntSessionId: z.string().uuid('Invalid hunt session ID'),
});

export const deleteHuntSchema = z.object({
  huntSessionId: z.string().uuid('Invalid hunt session ID'),
});

export const auditStatusSchema = z.object({
  auditSessionId: z.string().uuid('Invalid audit session ID'),
});

export const cancelAuditSchema = z.object({
  auditSessionId: z.string().uuid('Invalid audit session ID'),
});

export const deleteAuditSchema = z.object({
  auditSessionId: z.string().uuid('Invalid audit session ID'),
});

export const exportToCsvSchema = z.object({
  leadIds: z.array(z.string()).optional(),
  status: z.enum(['HOT', 'WARM', 'COLD']).optional(),
  search: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
});

export const importFromCsvSchema = z.object({
  csvContent: z.string().min(1, 'CSV content is required'),
  huntSessionId: z.string().optional(),
});
