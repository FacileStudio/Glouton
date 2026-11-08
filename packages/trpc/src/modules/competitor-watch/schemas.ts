import { z } from 'zod';

const id = z.string().uuid();
const teamId = z.string().uuid().optional();

export const PAGE_KINDS = ['PRICING', 'OFFER', 'BLOG', 'JOBS', 'OTHER'] as const;

const pageFields = {
  url: z.string().trim().min(1).max(2000),
  selector: z.string().trim().max(200).nullable().optional(),
  kind: z.enum(PAGE_KINDS).optional(),
  thresholdPct: z.number().int().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
};

export const competitorScopeSchema = z.object({ teamId, competitorId: id });

export const addPageSchema = z.object({ teamId, competitorId: id, ...pageFields });

export const updatePageSchema = z.object({
  teamId,
  competitorId: id,
  pageId: id,
  ...pageFields,
  url: pageFields.url.optional(),
});

export const pageIdSchema = z.object({ teamId, competitorId: id, pageId: id });

export const changesSchema = z.object({
  teamId,
  competitorId: id,
  pageId: id.optional(),
  limit: z.number().int().min(1).max(100).default(30),
});

export const markSeenSchema = z.object({ teamId, competitorId: id, changeIds: z.array(id).max(200).optional() });

export const unseenCountsSchema = z.object({ teamId }).optional();
