import { z } from 'zod';

const id = z.string().uuid();
const teamId = z.string().uuid().optional();
const line = z.string().trim().min(1).max(500);
const lines = z.array(line).max(50);
const longText = z.string().trim().max(10_000).nullable();

export const objectionSchema = z.object({
  objection: z.string().trim().min(1).max(500),
  response: z.string().trim().max(2000).default(''),
  proof: z.string().trim().max(1000).default(''),
});

export type Objection = z.infer<typeof objectionSchema>;

export const battlecardSchema = z.object({
  overview: longText.optional(),
  whyWeWin: lines.optional(),
  whyWeLose: lines.optional(),
  objections: z.array(objectionSchema).max(50).optional(),
  landmines: lines.optional(),
  pricing: longText.optional(),
  proofPoints: lines.optional(),
});

export const competitorFieldsSchema = battlecardSchema.extend({
  name: z.string().trim().min(1).max(200),
  website: z.string().trim().max(500).nullable().optional(),
  area: z.string().trim().max(200).nullable().optional(),
  nafCodes: z.array(z.string().trim().min(1).max(10)).max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  notes: longText.optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

export const createCompetitorSchema = competitorFieldsSchema.extend({ teamId });

export const updateCompetitorSchema = competitorFieldsSchema.partial().extend({ teamId, competitorId: id });

export const competitorIdSchema = z.object({ teamId, competitorId: id });

export const listCompetitorsSchema = z
  .object({
    teamId,
    q: z.string().trim().max(200).optional(),
    tag: z.string().trim().max(40).optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  })
  .optional();

export const compareCompetitorsSchema = z.object({
  teamId,
  competitorIds: z.array(id).min(2).max(4),
});

export const LOSS_REASONS = ['LOST_TO_COMPETITOR', 'PRICE', 'NO_DECISION', 'NO_BUDGET', 'TIMING', 'FEATURES', 'OTHER'] as const;
export const COMPETITOR_LOSS_REASONS = ['PRICE', 'FEATURES', 'RELATIONSHIP', 'BRAND', 'TIMING', 'OTHER'] as const;

export const closeLeadSchema = z.object({
  teamId,
  leadId: id,
  outcome: z.enum(['WON', 'LOST']),
  lossReason: z.enum(LOSS_REASONS).nullable().optional(),
  lostToCompetitorId: id.nullable().optional(),
  competitorLossReason: z.enum(COMPETITOR_LOSS_REASONS).nullable().optional(),
  wonAgainstCompetitorId: id.nullable().optional(),
});

export type CloseLeadInput = z.infer<typeof closeLeadSchema>;

export const reopenLeadSchema = z.object({ teamId, leadId: id });
