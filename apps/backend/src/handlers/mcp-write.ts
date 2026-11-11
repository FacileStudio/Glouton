import { newTool, type Tool } from '@facile/tronc/mcp';
import {
  contactSchemas,
  contactService,
  draftCreateSchema,
  draftUpdateSchema,
  inboxService,
  suggestionCreateSchema,
  suggestionInput,
} from '@repo/trpc';
import { guarded } from './mcp-errors';
import { camel, pick, snake } from './mcp-format';
import {
  accessOf, COMPANY_FIELDS, companyKeys, CREATE, DRAFT_FIELDS, id, OVERWRITE, PERSON_FIELDS, personKeys, SEARCH_HINT,
  teamId, temperature, text, type Args, type ToolDeps,
} from './mcp-schema';

const SUGGESTION_KIND = {
  type: 'string',
  enum: ['FOLLOW_UP', 'RESCORE', 'NEXT_ACTION', 'MATCH'],
  description: 'RESCORE proposes a new temperature or score; NEXT_ACTION and FOLLOW_UP describe the step in body',
};

/** The seven write tools: create and update companies and people, drafts and suggestions. None sends mail. */
export function writeTools(deps: ToolDeps): Tool[] {
  const inbox = ` Nothing is ever sent: the person reviews and sends it from Glouton's agent inbox at ${deps.inboxUrl}.`;

  const createCompany = newTool<Args>({
    name: 'glouton_company_create',
    title: 'Create a company',
    description:
      'Creates a company in Glouton, optionally with its people. Search glouton_contacts_search first so you do not create a duplicate. ' +
      'name is required; domain is the bare domain such as example.com.',
    annotations: CREATE,
    inputSchema: {
      type: 'object',
      properties: {
        ...COMPANY_FIELDS,
        team_id: teamId,
        people: { type: 'array', maxItems: 20, items: { type: 'object', properties: PERSON_FIELDS }, description: 'People to create at this company' },
      },
      required: ['name'],
    },
  }, guarded('', async (input, { caller }) => {
    const fields = contactSchemas.companyCreateSchema
      .pick({ name: true, domain: true, website: true, city: true, country: true, stage: true, notes: true, teamId: true, people: true })
      .parse(camel(input));
    const company = await contactService.createCompany(deps.prisma, await accessOf(deps.prisma, caller), fields, 'AGENT');
    return {
      company: snake({
        ...pick(company, companyKeys),
        people: company.people.map((p) => pick(p, ['id', 'firstName', 'lastName', 'email', 'role'])),
      }),
    };
  }));

  const updateCompany = newTool<Args>({
    name: 'glouton_company_update',
    title: 'Update a company',
    description:
      'Changes a Glouton company: its details, stage, temperature or score. Only the fields you pass change; the others keep their value. ' +
      'company_id comes from glouton_contacts_search.',
    annotations: OVERWRITE,
    inputSchema: {
      type: 'object',
      properties: {
        company_id: id('The company id'),
        ...COMPANY_FIELDS,
        temperature,
        score: { type: 'integer', minimum: 0, maximum: 100, description: 'Lead score from 0 to 100' },
      },
      required: ['company_id'],
    },
  }, guarded(SEARCH_HINT, async ({ company_id, ...input }, { caller }) => {
    const patch = contactSchemas.companyUpdateSchema
      .pick({ name: true, domain: true, website: true, city: true, country: true, stage: true, notes: true, temperature: true, score: true })
      .parse(camel(input));
    const company = await contactService.updateCompany(deps.prisma, await accessOf(deps.prisma, caller), String(company_id), patch, deps.hooks);
    return { company: snake(pick(company, companyKeys)) };
  }));

  const createPerson = newTool<Args>({
    name: 'glouton_person_create',
    title: 'Create a person',
    description:
      'Creates a person in Glouton, linked to a company when you pass company_id. Search glouton_contacts_search first so you do not create a duplicate. ' +
      'Pass at least a name or an email.',
    annotations: CREATE,
    inputSchema: {
      type: 'object',
      properties: { company_id: id('The company this person works for'), ...PERSON_FIELDS, team_id: teamId },
    },
  }, guarded(SEARCH_HINT, async (input, { caller }) => {
    const fields = contactSchemas.personCreateSchema
      .refine((p) => Boolean(p.firstName || p.lastName || p.email), 'a person needs a name or an email')
      .parse(camel(input));
    const person = await contactService.createPerson(deps.prisma, await accessOf(deps.prisma, caller), fields, 'AGENT');
    return { person: snake(pick(person, personKeys)) };
  }));

  const updatePerson = newTool<Args>({
    name: 'glouton_person_update',
    title: 'Update a person',
    description:
      'Changes a Glouton person. Only the fields you pass change; the others keep their value. ' +
      'person_id comes from glouton_contacts_search or glouton_company_get.',
    annotations: OVERWRITE,
    inputSchema: {
      type: 'object',
      properties: { person_id: id('The person id'), company_id: id('Move the person to this company'), ...PERSON_FIELDS },
      required: ['person_id'],
    },
  }, guarded(SEARCH_HINT, async ({ person_id, ...input }, { caller }) => {
    const patch = contactSchemas.personUpdateSchema.omit({ isBillingContact: true }).parse(camel(input));
    const person = await contactService.updatePerson(deps.prisma, await accessOf(deps.prisma, caller), String(person_id), patch, deps.hooks);
    return { person: snake(pick(person, personKeys)) };
  }));

  const saveDraft = newTool<Args>({
    name: 'glouton_draft_save',
    title: 'Save an email draft',
    description:
      `Saves an outreach email draft for a Glouton person.${inbox} Tell the user where to find it. ` +
      'person_id comes from glouton_contacts_search; subject and text are required.',
    annotations: CREATE,
    inputSchema: {
      type: 'object',
      properties: { person_id: id('The person the email is for'), ...DRAFT_FIELDS },
      required: ['person_id', 'subject', 'text'],
    },
  }, guarded(SEARCH_HINT, async (input, { caller }) => {
    const draft = await inboxService.createDraft(deps.prisma, await accessOf(deps.prisma, caller), draftCreateSchema.parse(camel(input)), deps.notify);
    return { draft: snake(pick(draft, ['id', 'status', 'subject', 'personId', 'companyId'])), inbox_url: deps.inboxUrl };
  }));

  const updateDraft = newTool<Args>({
    name: 'glouton_draft_update',
    title: 'Update an email draft',
    description: `Changes a Glouton draft that is still unsent. Only the fields you pass change.${inbox} draft_id comes from glouton_draft_save.`,
    annotations: OVERWRITE,
    inputSchema: {
      type: 'object',
      properties: { draft_id: id('The draft id'), ...DRAFT_FIELDS },
      required: ['draft_id'],
    },
  }, guarded('Call glouton_outreach_list to find the drafts.', async ({ draft_id, ...input }, { caller }) => {
    const patch = draftUpdateSchema.parse(camel(input));
    const draft = await inboxService.updateDraft(deps.prisma, await accessOf(deps.prisma, caller), String(draft_id), patch);
    return { draft: snake(pick(draft, ['id', 'status', 'subject', 'personId', 'companyId'])), inbox_url: deps.inboxUrl };
  }));

  const createSuggestion = newTool<Args>({
    name: 'glouton_suggestion_create',
    title: 'Suggest an action',
    description:
      `Proposes a follow-up, a rescore or a next action on a Glouton company or person. The person accepts or dismisses it in Glouton's agent inbox at ${deps.inboxUrl}. ` +
      'Call glouton_suggestions_list first so you do not repeat an open one.',
    annotations: CREATE,
    inputSchema: {
      type: 'object',
      properties: {
        kind: SUGGESTION_KIND,
        title: text('One line the person reads in the inbox', 300),
        body: text('Details of the proposed action', 10_000),
        rationale: text('The evidence behind the suggestion', 5000),
        company_id: id('The company it is about'),
        person_id: id('The person it is about'),
        temperature: { ...temperature, description: 'RESCORE only: the proposed temperature' },
        score: { type: 'integer', minimum: 0, maximum: 100, description: 'RESCORE only: the proposed score from 0 to 100' },
      },
      required: ['kind', 'title'],
    },
  }, guarded(SEARCH_HINT, async ({ temperature: temp, score, ...input }, { caller }) => {
    const proposal = { ...(temp !== undefined && { temperature: temp }), ...(score !== undefined && { score }) };
    const parsed = suggestionCreateSchema
      .omit({ teamId: true })
      .parse({ ...(camel(input) as Args), ...(Object.keys(proposal).length > 0 && { payload: proposal }) });
    const suggestion = await inboxService.createSuggestion(deps.prisma, await accessOf(deps.prisma, caller), suggestionInput(parsed), deps.notify);
    return { suggestion: snake(pick(suggestion, ['id', 'kind', 'title', 'status', 'companyId', 'personId'])), inbox_url: deps.inboxUrl };
  }));

  return [createCompany, updateCompany, createPerson, updatePerson, saveDraft, updateDraft, createSuggestion];
}
