import { z } from 'zod';
import { AI_LANGUAGES } from '../competitor-ai/prompt';
import { frequencySchema } from '../schedule/schemas';
import { APPLICATION_STATUSES } from './applications';
import { MAX_CV_BYTES, MAX_CV_TEXT } from './cv';
import { JOB_CONTRACTS } from './filters';

const teamId = z.string().uuid().optional();
const id = z.string().uuid();
const text = (max: number) => z.string().trim().max(max).nullish();

export const scopeSchema = z.object({ teamId }).optional();

export const searchFieldsSchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    role: z.string().trim().max(200).default(''),
    skills: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    location: text(200).transform((value) => value ?? null),
    remote: z.boolean().default(false),
    contracts: z.array(z.enum(JOB_CONTRACTS)).max(JOB_CONTRACTS.length).default([]),
    salaryMin: z.number().int().min(0).max(10_000_000).nullish().transform((value) => value ?? null),
    frequency: frequencySchema.nullish().transform((value) => value ?? null),
  })
  .refine((value) => value.role.length > 0 || value.skills.length > 0, { message: 'Give a job title or at least one skill', path: ['role'] });

export const createSearchSchema = z.object({ teamId, search: searchFieldsSchema, runNow: z.boolean().optional() });
export const updateSearchSchema = z.object({ teamId, searchId: id, search: searchFieldsSchema });
export const searchIdSchema = z.object({ teamId, searchId: id });

export const listOffersSchema = z.object({ teamId, searchId: id.optional(), status: z.enum(['NEW', 'SAVED', 'DISMISSED']).optional() });
export const offerIdSchema = z.object({ teamId, offerId: id });

const date = z.coerce.date().nullish();
const link = z.string().trim().url().max(1000);

export const applicationFieldsSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  company: text(200),
  url: z.union([link, z.literal('')]).nullish(),
  location: text(200),
  description: text(8000),
  notes: text(10_000),
  contactName: text(200),
  contactEmail: z.union([z.string().trim().email().max(320), z.literal('')]).nullish(),
  contactPhone: text(60),
  links: z.array(link).max(20).optional(),
  appliedAt: date,
  interviewAt: date,
  offerAt: date,
  rejectedAt: date,
  remindAt: date,
});

export const listApplicationsSchema = z.object({ teamId, status: z.enum(APPLICATION_STATUSES).optional() });
export const applicationIdSchema = z.object({ teamId, applicationId: id });
export const createApplicationSchema = z.object({ teamId, application: applicationFieldsSchema.extend({ title: z.string().trim().min(1).max(300) }) });
export const updateApplicationSchema = z.object({ teamId, applicationId: id, application: applicationFieldsSchema });
export const moveApplicationSchema = z.object({ teamId, applicationId: id, status: z.enum(APPLICATION_STATUSES) });

const BASE64_MAX = Math.ceil(MAX_CV_BYTES / 3) * 4;

export const createCvSchema = z
  .object({
    teamId,
    name: z.string().trim().min(1).max(120),
    fileName: z.string().trim().max(200).optional(),
    data: z.string().max(BASE64_MAX, 'cv_too_large').regex(/^[A-Za-z0-9+/]*={0,2}$/, 'cv_type').optional(),
    text: z.string().max(MAX_CV_TEXT).optional(),
  })
  .refine((value) => Boolean(value.data) || Boolean(value.text?.trim()), { message: 'cv_empty', path: ['data'] });

export const cvIdSchema = z.object({ teamId, cvId: id });
export const updateCvSchema = z.object({
  teamId,
  cvId: id,
  name: z.string().trim().min(1).max(120).optional(),
  text: z.string().max(MAX_CV_TEXT).optional(),
  shared: z.boolean().optional(),
});

export const draftSchema = z.object({
  teamId,
  applicationId: id,
  kind: z.enum(['CV', 'LETTER']),
  cvId: id.optional(),
  language: z.enum(AI_LANGUAGES).default('fr'),
});
export const draftIdSchema = z.object({ teamId, draftId: id });
export const updateDraftSchema = z.object({ teamId, draftId: id, content: z.string().trim().min(1).max(20_000) });
