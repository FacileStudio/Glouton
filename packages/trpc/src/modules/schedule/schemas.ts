import { z } from 'zod';
import { startLocalBusinessHuntSchema } from '../lead/schemas';

const teamId = z.string().uuid().optional();

export const frequencySchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY']);

/** The filters a schedule repeats: the same ones a local business hunt takes. */
export const scheduleFiltersSchema = startLocalBusinessHuntSchema.omit({ teamId: true });

export const createScheduleSchema = scheduleFiltersSchema.extend({
  teamId,
  frequency: frequencySchema,
  name: z.string().trim().min(1).max(120).optional(),
  runNow: z.boolean().optional(),
});

export const scheduleIdSchema = z.object({ teamId, scheduleId: z.string().uuid() });

export const updateScheduleSchema = scheduleIdSchema.extend({
  frequency: frequencySchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

export const fromSessionSchema = z.object({ teamId, huntSessionId: z.string().uuid(), frequency: frequencySchema });

export const fromProfileSchema = z.object({ teamId, frequency: frequencySchema });

export type ScheduleFilters = z.infer<typeof scheduleFiltersSchema>;
