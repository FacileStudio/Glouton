import { z } from 'zod';
import { WEBHOOK_EVENT_KEYS, type WebhookEvent } from '@repo/webhooks';
import { checkPublicUrl } from '@repo/websearch';
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
  // OWNER is intentionally excluded: a team has exactly one owner.
  role: z.enum(['ADMIN', 'MEMBER']).transform((val) => val as TeamRole),
});

export const leaveTeamSchema = z.object({
  teamId: z.string(),
});

export const teamIdSchema = z.object({
  teamId: z.string(),
});

const webhookEventSchema = z
  .enum(WEBHOOK_EVENT_KEYS as [WebhookEvent, ...WebhookEvent[]]);

function isPublicUrl(url: string): boolean {
  try {
    checkPublicUrl(url);
    return true;
  } catch {
    return false;
  }
}

const webhookUrlSchema = z
  .string()
  .url('URL invalide')
  .max(2000, 'URL trop longue')
  .refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
    message: 'Seuls les schémas http(s) sont acceptés',
  })
  .refine(isPublicUrl, {
    message: 'Adresse refusée : utilisez une URL publique, sans identifiants ni adresse interne',
  });

export const createWebhookSchema = z.object({
  teamId: z.string(),
  name: z.string().min(1, 'Nom requis').max(100, 'Nom trop long'),
  url: webhookUrlSchema,
  events: z.array(webhookEventSchema).min(1, 'Sélectionnez au moins un événement'),
  enabled: z.boolean().optional(),
});

export const updateWebhookSchema = z.object({
  teamId: z.string(),
  webhookId: z.string(),
  name: z.string().min(1, 'Nom requis').max(100, 'Nom trop long').optional(),
  url: webhookUrlSchema.optional(),
  events: z.array(webhookEventSchema).min(1, 'Sélectionnez au moins un événement').optional(),
  enabled: z.boolean().optional(),
});

export const deleteWebhookSchema = z.object({
  teamId: z.string(),
  webhookId: z.string(),
});

export const testWebhookSchema = z.object({
  teamId: z.string(),
  url: webhookUrlSchema,
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
