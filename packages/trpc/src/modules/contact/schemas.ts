import { z } from 'zod';

export const contactStageSchema = z.enum(['PROSPECT', 'CONTACTED', 'CLIENT', 'PARTNER', 'PERSONAL']);
export const contactOriginSchema = z.enum(['HUNT', 'CSV', 'MANUAL', 'ARDOISE', 'COURRIER', 'AGENT']);
export const temperatureSchema = z.enum(['HOT', 'WARM', 'COLD']);

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullish();

export const listFiltersSchema = z.object({
  q: text(200).optional(),
  stage: contactStageSchema.optional(),
  temperature: temperatureSchema.optional(),
  origin: contactOriginSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
});

export const personInputSchema = z.object({
  firstName: optionalText(120),
  lastName: optionalText(120),
  email: z.string().trim().email().max(320).nullish(),
  role: optionalText(120),
  phones: z.array(text(40)).max(10).optional(),
  notes: optionalText(5000),
  stage: contactStageSchema.optional(),
  isBillingContact: z.boolean().optional(),
});

export const companyCreateSchema = z.object({
  name: text(200).min(1),
  legalName: optionalText(200),
  domain: optionalText(253),
  website: optionalText(500),
  siret: optionalText(20),
  vatNumber: optionalText(30),
  addressLine: optionalText(300),
  postalCode: optionalText(20),
  city: optionalText(120),
  country: optionalText(80),
  category: optionalText(120),
  stage: contactStageSchema.optional(),
  temperature: temperatureSchema.optional(),
  score: z.number().int().min(0).max(100).optional(),
  notes: optionalText(5000),
  teamId: z.string().uuid().nullish(),
  people: z.array(personInputSchema).max(20).optional(),
});

export const companyUpdateSchema = companyCreateSchema
  .omit({ people: true, teamId: true })
  .partial();

export const personCreateSchema = personInputSchema.extend({
  companyId: z.string().nullish(),
  teamId: z.string().uuid().nullish(),
});

export const personUpdateSchema = personInputSchema.extend({ companyId: z.string().nullish() }).partial();

export const duplicateCheckSchema = z
  .object({
    email: z.string().trim().max(320).optional(),
    domain: z.string().trim().max(253).optional(),
    siret: z.string().trim().max(20).optional(),
  })
  .refine((v) => Boolean(v.email || v.domain || v.siret), 'Give an email, a domain or a SIRET');

export type ListFilters = z.infer<typeof listFiltersSchema>;
export type PersonInput = z.infer<typeof personInputSchema>;
export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;
export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>;
export type PersonCreateInput = z.infer<typeof personCreateSchema>;
export type PersonUpdateInput = z.infer<typeof personUpdateSchema>;
export type DuplicateCheckInput = z.infer<typeof duplicateCheckSchema>;
