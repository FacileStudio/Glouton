import { z } from 'zod';

export const listOpportunitiesSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(30),
  search: z.string().optional(),
  tier: z.enum(['HOT', 'WARM', 'COLD']).optional(),
  category: z.string().optional(),
  source: z.string().optional(),
  remoteOnly: z.boolean().optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  sortBy: z
    .enum(['relevanceScore', 'postedAt', 'createdAt', 'budgetMax', 'applicantCount'])
    .default('relevanceScore'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const getOpportunitySchema = z.object({
  id: z.string(),
});

export const markClickedSchema = z.object({
  id: z.string(),
});

export const triggerScrapeSchema = z.object({}).optional();

export type ListOpportunitiesInput = z.infer<typeof listOpportunitiesSchema>;
export type GetOpportunityInput = z.infer<typeof getOpportunitySchema>;
