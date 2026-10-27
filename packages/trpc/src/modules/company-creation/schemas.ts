import { z } from 'zod';

export const listCompanyCreationsSchema = z.object({
  country: z.string().optional(),
  search: z.string().optional(),
  hasWebsite: z.boolean().optional(),
  activityCode: z.string().optional(),
  postalCode: z.string().optional(),
  publishedAfter: z.string().or(z.date()).optional(),
  publishedBefore: z.string().or(z.date()).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['publishedAt', 'name', 'createdAt']).default('publishedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const getCompanyCreationSchema = z.object({
  id: z.string(),
});

export const convertToLeadSchema = z.object({
  creationId: z.string(),
  teamId: z.string().optional(),
});

export type ListCompanyCreationsInput = z.infer<typeof listCompanyCreationsSchema>;
export type GetCompanyCreationInput = z.infer<typeof getCompanyCreationSchema>;
export type ConvertToLeadInput = z.infer<typeof convertToLeadSchema>;
