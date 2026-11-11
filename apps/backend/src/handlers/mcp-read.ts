import { z } from 'zod';
import { detailed, newTool, type Tool } from '@facile/tronc/mcp';
import { contactSchemas, contactService, inboxService, suggestionStatusSchema } from '@repo/trpc';
import { guarded } from './mcp-errors';
import { fitList, offsetOf, page, pick, short, snake } from './mcp-format';
import {
  accessOf, activityOf, companyDetailKeys, companyKeys, companyListKeys, cursor, id, limit, outreachOf, personDetailKeys,
  personKeys, READ, responseFormat, SEARCH_HINT, stage, suggestionOf, temperature, text, type Args, type Outreach, type ToolDeps,
} from './mcp-schema';

/** The five read tools: search, one company, one person, outreach and suggestions. */
export function readTools(deps: ToolDeps): Tool[] {
  const searchContacts = newTool<Args>({
    name: 'glouton_contacts_search',
    title: 'Search contacts',
    description:
      "Searches the user's prospects and contacts in Glouton, companies and people together, newest first, with their stage and temperature. " +
      'Use it to find a company_id or person_id, or to pick prospects by temperature. query matches names, emails, domains and cities.',
    annotations: READ,
    inputSchema: {
      type: 'object',
      properties: { query: text('Text to match'), stage, temperature, limit, cursor, response_format: responseFormat },
    },
  }, guarded('', async (input, { caller }) => {
    const filters = contactSchemas.listFiltersSchema
      .pick({ q: true, stage: true, temperature: true, limit: true })
      .parse({ q: input.query, stage: input.stage, temperature: input.temperature, limit: input.limit });
    const full = detailed(input.response_format as string | undefined);
    const offset = offsetOf(input.cursor as string | undefined);
    const rows = await contactService.searchContacts(deps.prisma, await accessOf(deps.prisma, caller), {
      ...filters, limit: offset + filters.limit + 1, offset: 0,
    });
    const shaped = rows.map((r) => (full ? r : pick(r, ['type', 'id', 'name', 'email', 'stage', 'temperature'])));
    const { items, next_cursor } = page(shaped, offset, filters.limit);
    return { contacts: snake(items), ...(next_cursor && { next_cursor }) };
  }));

  const getCompany = newTool<Args>({
    name: 'glouton_company_get',
    title: 'Get a company',
    description:
      'Shows one Glouton company with its people, open suggestions and website audit. detailed adds its notes, recent activity and outreach emails. ' +
      'company_id comes from glouton_contacts_search.',
    annotations: READ,
    inputSchema: {
      type: 'object',
      properties: { company_id: id('The company id'), response_format: responseFormat },
      required: ['company_id'],
    },
  }, guarded(SEARCH_HINT, async (input, { caller }) => {
    const full = detailed(input.response_format as string | undefined);
    const company = await contactService.getCompany(deps.prisma, await accessOf(deps.prisma, caller), String(input.company_id));
    const people = company.people.map((p) => pick(p, ['id', 'firstName', 'lastName', 'email', 'role', 'stage']));
    const base = {
      ...pick(company, full ? companyDetailKeys : companyKeys),
      audit: company.auditSummary,
      people: people.slice(0, 100),
      peopleTotal: people.length,
      suggestions: company.suggestions.map(suggestionOf),
    };
    if (!full) return { company: snake(base) };
    const withActivity = { ...base, activities: company.activities.map(activityOf) };
    const outreach = company.outreach.map((o) => outreachOf(o as Outreach, true));
    return { company: snake({ ...withActivity, outreach: fitList(outreach, (list) => ({ ...withActivity, outreach: list })) }) };
  }));

  const getPerson = newTool<Args>({
    name: 'glouton_person_get',
    title: 'Get a person',
    description:
      'Shows one Glouton person with their company and outreach emails. detailed adds their notes, activity and email bodies. ' +
      'person_id comes from glouton_contacts_search or glouton_company_get.',
    annotations: READ,
    inputSchema: {
      type: 'object',
      properties: { person_id: id('The person id'), response_format: responseFormat },
      required: ['person_id'],
    },
  }, guarded(SEARCH_HINT, async (input, { caller }) => {
    const full = detailed(input.response_format as string | undefined);
    const person = await contactService.getPerson(deps.prisma, await accessOf(deps.prisma, caller), String(input.person_id));
    const base = {
      ...pick(person, full ? personDetailKeys : personKeys),
      company: person.company ? pick(person.company, companyListKeys) : null,
      suggestions: person.suggestions.map(suggestionOf),
      outreach: person.outreach.map((o) => outreachOf(o as Outreach, full)),
      ...(full && { activities: person.activities.map(activityOf) }),
    };
    return { person: snake({ ...base, outreach: fitList(base.outreach, (list) => ({ ...base, outreach: list })) }) };
  }));

  const listOutreach = newTool<Args>({
    name: 'glouton_outreach_list',
    title: 'List outreach emails',
    description:
      'Lists outreach emails, newest first: status, subject, sent and replied dates, and whether the agent drafted them. ' +
      'Pass company_id or person_id to narrow it to one contact. detailed adds the plain-text body.',
    annotations: READ,
    inputSchema: {
      type: 'object',
      properties: {
        company_id: id('Only the emails of this company'),
        person_id: id('Only the emails of this person'),
        limit, cursor, response_format: responseFormat,
      },
    },
  }, guarded(SEARCH_HINT, async (input, { caller }) => {
    const full = detailed(input.response_format as string | undefined);
    const size = z.number().int().min(1).max(100).default(25).parse(input.limit);
    const offset = offsetOf(input.cursor as string | undefined);
    const filter = { companyId: input.company_id as string | undefined, personId: input.person_id as string | undefined };
    const rows = await contactService.listOutreach(deps.prisma, await accessOf(deps.prisma, caller), filter, offset + size + 1);
    const { items, next_cursor } = page(rows.map((r) => outreachOf(r, full)), offset, size);
    return { outreach: snake(items), ...(next_cursor && { next_cursor }) };
  }));

  const listSuggestions = newTool<Args>({
    name: 'glouton_suggestions_list',
    title: 'List suggestions',
    description:
      "Lists the suggestions in Glouton's agent inbox, open ones by default, so you do not repeat one. status filters by OPEN, ACCEPTED or DISMISSED.",
    annotations: READ,
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['OPEN', 'ACCEPTED', 'DISMISSED'], description: 'Defaults to OPEN' },
        cursor, response_format: responseFormat,
      },
    },
  }, guarded('', async (input, { caller }) => {
    const full = detailed(input.response_format as string | undefined);
    const status = suggestionStatusSchema.default('OPEN').parse(input.status);
    const offset = offsetOf(input.cursor as string | undefined);
    const rows = await inboxService.listSuggestions(deps.prisma, await accessOf(deps.prisma, caller), status);
    const shaped = rows.map((s) => ({
      ...pick(s, ['id', 'kind', 'title', 'status', 'createdAt']),
      company: s.company,
      person: s.person ? pick(s.person, ['id', 'firstName', 'lastName']) : null,
      ...(full && { body: short(s.body), rationale: short(s.rationale), payload: s.payload, createdBy: s.createdBy }),
    }));
    const { items, next_cursor } = page(shaped, offset, 100);
    return { suggestions: snake(items), ...(next_cursor && { next_cursor }) };
  }));

  return [searchContacts, getCompany, getPerson, listOutreach, listSuggestions];
}
