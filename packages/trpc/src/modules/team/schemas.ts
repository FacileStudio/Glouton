import { z } from 'zod';
import { TeamRole } from './permissions';

export const teamRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER']);

export const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(100, 'Team name too long'),
  description: z.string().max(500, 'Description too long').optional(),
});

export const updateTeamSchema = z.object({
  teamId: z.string(),
  name: z.string().min(1, 'Team name is required').max(100, 'Team name too long').optional(),
  description: z.string().max(500, 'Description too long').optional(),
});

export const addMemberSchema = z.object({
  teamId: z.string(),
  email: z.string().email('Invalid email address'),
  role: z.enum(['ADMIN', 'MEMBER']).transform((val) => val as TeamRole),
});

export const removeMemberSchema = z.object({
  teamId: z.string(),
  userId: z.string(),
});

export const updateMemberRoleSchema = z.object({
  teamId: z.string(),
  userId: z.string(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).transform((val) => val as TeamRole),
});

export const leaveTeamSchema = z.object({
  teamId: z.string(),
});

export const teamIdSchema = z.object({
  teamId: z.string(),
});

export const updateApiKeysSchema = z.object({
  teamId: z.string(),
  hunterApiKey: z.string().optional(),
  apolloApiKey: z.string().optional(),
  snovApiKey: z.string().optional(),
  hasdataApiKey: z.string().optional(),
  contactoutApiKey: z.string().optional(),
  googleMapsApiKey: z.string().optional(),
});

export const updateSmtpConfigSchema = z.object({
  teamId: z.string(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpFromName: z.string().optional(),
  smtpFromEmail: z.string().email().optional(),
});
