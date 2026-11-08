import { z } from 'zod';

const teamId = z.string().uuid().optional();

export const scopeSchema = z.object({ teamId }).optional();

export const listSuggestionsSchema = z
  .object({ teamId, status: z.enum(['PENDING', 'REJECTED']).optional() })
  .optional();

export const suggestionIdSchema = z.object({ teamId, suggestionId: z.string().uuid() });

export const acceptAboveSchema = z.object({ teamId, minScore: z.number().int().min(1).max(100) });
