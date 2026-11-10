import { z } from 'zod';
import { isHuntCategory } from '../../../taxonomy';

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

/** What a local business hunt searches for: an old category or a curated OpenStreetMap tag such as `craft=plumber`. */
export const huntCategorySchema = z.string().trim().refine(isHuntCategory, 'Unknown category');

export const startLocalBusinessHuntSchema = z.object({
  teamId: z.string().uuid().optional(),
  location: z.string().min(1, 'Location is required'),
  categories: z.array(huntCategorySchema).min(1, 'At least one category is required').max(30),
  hasWebsite: z.boolean().optional(),
  radius: z.number().int().min(100).max(50000).optional(),
  maxResults: z.number().int().min(1).max(500).optional(),
});

export const listLeadsSchema = z
  .object({
    teamId: z.string().uuid().optional(),
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
  leadId: z.string().uuid('Invalid lead ID'),
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
  teamId: z.string().uuid().optional(),
  leadIds: z.array(z.string()).optional(),
  status: z.enum(['HOT', 'WARM', 'COLD']).optional(),
  search: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
});

export const importFromCsvSchema = z.object({
  csvContent: z.string().min(1, 'CSV content is required').max(5 * 1024 * 1024, 'CSV too large (max 5MB)'),
  huntSessionId: z.string().optional(),
  teamId: z.string().uuid().optional(),
});
