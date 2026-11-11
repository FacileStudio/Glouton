import type { Caller } from '@facile/tronc/mcp';
import type { PrismaClient } from '@prisma/client';
import { accessForUser, contactService, type inboxService } from '@repo/trpc';
import { pick, short } from './mcp-format';

/** What the Glouton tools need from the app. */
export interface ToolDeps {
  prisma: PrismaClient;
  hooks?: contactService.SyncHooks;
  notify?: inboxService.Notify;
  /** The agent inbox page, where the person reviews drafts and suggestions. */
  inboxUrl: string;
}

export type Args = Record<string, unknown>;

export const STAGES = ['PROSPECT', 'CONTACTED', 'CLIENT', 'PARTNER', 'PERSONAL'];
export const TEMPERATURES = ['HOT', 'WARM', 'COLD'];

export const READ = { readOnly: true, destructive: false, idempotent: true, openWorld: false };
export const CREATE = { readOnly: false, destructive: false, idempotent: false, openWorld: false };
export const OVERWRITE = { readOnly: false, destructive: true, idempotent: true, openWorld: false };

export const text = (description: string, maxLength = 200) => ({ type: 'string', maxLength, description });
export const id = (description: string) => ({ type: 'string', minLength: 1, maxLength: 64, description });
export const stage = { type: 'string', enum: STAGES, description: 'Where the contact stands with the user' };
export const temperature = { type: 'string', enum: TEMPERATURES, description: 'How warm the prospect is' };
export const responseFormat = {
  type: 'string',
  enum: ['concise', 'detailed'],
  description: 'concise (default) returns the key fields; detailed adds notes, activity and email bodies',
};
export const cursor = { type: 'string', description: 'next_cursor from the previous page; omit it for the first page' };
export const limit = { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum results on this page (default 25)' };
export const teamId = { type: 'string', description: 'The Glouton space (team) id; omit it for the personal space' };

export const COMPANY_FIELDS = {
  name: text('Company name'),
  domain: text('Bare domain such as example.com', 253),
  website: text('Website URL', 500),
  city: text('City', 120),
  country: text('Country', 80),
  stage,
  notes: text('Free notes', 5000),
};

export const PERSON_FIELDS = {
  first_name: text('First name', 120),
  last_name: text('Last name', 120),
  email: text('Email address', 320),
  role: text('Job title or role at the company', 120),
  phones: { type: 'array', items: text('Phone number', 40), maxItems: 10 },
  stage,
  notes: text('Free notes', 5000),
};

export const DRAFT_FIELDS = {
  subject: text('Email subject', 300),
  text: text('Plain-text body', 50_000),
  html: text('Optional HTML body', 100_000),
  rationale: text('Why this email, for the person reviewing it', 5000),
};

export const SEARCH_HINT = 'Call glouton_contacts_search to find valid ids.';

export const companyListKeys = ['id', 'name', 'domain', 'city', 'stage', 'temperature', 'score'] as const;
export const companyKeys = ['id', 'teamId', 'name', 'domain', 'website', 'city', 'country', 'stage', 'temperature', 'score', 'updatedAt'] as const;
export const companyDetailKeys = [
  ...companyKeys, 'legalName', 'siret', 'vatNumber', 'addressLine', 'postalCode', 'category', 'emails', 'phones', 'notes', 'origin', 'createdAt',
] as const;
export const personKeys = ['id', 'teamId', 'firstName', 'lastName', 'email', 'role', 'stage', 'phones', 'companyId', 'updatedAt'] as const;
export const personDetailKeys = [...personKeys, 'notes', 'isBillingContact', 'origin', 'createdAt'] as const;
export const outreachKeys = ['id', 'status', 'subject', 'origin', 'personId', 'companyId', 'sentAt', 'repliedAt', 'createdAt'] as const;

export type Outreach = Awaited<ReturnType<typeof contactService.listOutreach>>[number];
type Activity = { kind: string; summary: string; actor: string | null; occurredAt: Date };
type SuggestionRow = { id: string; kind: string; title: string; body: string | null; status: string; createdAt: Date };

export function outreachOf(row: Outreach, full: boolean) {
  const base = pick(row, outreachKeys);
  return full ? { ...base, rationale: short(row.rationale), text: short(row.textBody) } : base;
}

export const activityOf = (a: Activity) => pick(a, ['kind', 'summary', 'actor', 'occurredAt']);
export const suggestionOf = (s: SuggestionRow) => ({ ...pick(s, ['id', 'kind', 'title', 'status', 'createdAt']), body: short(s.body) });

/** Every MCP caller is an agent: its activity is labelled with the acting client. */
export function actorOf(caller: Caller): string {
  return caller.actor || caller.clientId || 'mcp';
}

/** The contacts the caller may use: every scope they belong to, plan or not, as MCP is free. */
export function accessOf(prisma: PrismaClient, caller: Caller) {
  return accessForUser(prisma, caller.userId, actorOf(caller), 'free');
}
