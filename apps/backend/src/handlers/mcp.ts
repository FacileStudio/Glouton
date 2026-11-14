import type { PrismaClient } from '@prisma/client';
import {
  Confirmations,
  digest,
  newServer,
  newTool,
  retrying,
  SqlPending,
  STATUS_PENDING,
  type Action,
  type AuditLogger,
  type Caller,
  type Options,
  type Outcome,
  type Pending,
  type RateLimit,
  type Server,
  type Tool,
} from '@facile/tronc/mcp';
import { accessForUser, contactService, type McpPending } from '@repo/trpc';
import { found, guarded, pageCall } from './mcp-errors';
import { readTools } from './mcp-read';
import type { ToolDeps } from './mcp-schema';
import { writeTools } from './mcp-write';

/** What Glouton's MCP server needs from the app. */
export interface McpDeps extends ToolDeps {
  /** The canonical resource URI, https://glouton.facile.studio/mcp. */
  resource: string;
  /** Registre's issuer, byte for byte the iss of its tokens. */
  issuer: string;
  verifier: Options['verifier'];
  version: string;
  /** Signs confirmation questions; 32 bytes or more, stable across restarts. */
  confirmKey: string;
  /** The confirm page, /app/pending. */
  confirmUrl: string;
  /** SqlPending over prisma when unset. */
  store?: Pending;
  audit?: AuditLogger;
  onError?: (err: unknown, tool: string) => void;
  /** The kit's per-person limit when unset. */
  rateLimit?: RateLimit;
}

const DELETE = { readOnly: false, destructive: true, idempotent: false, openWorld: false };

const INSTRUCTIONS =
  "Glouton is the user's contacts and prospecting database: companies, people, outreach emails and an agent inbox. " +
  'Find ids with glouton_contacts_search first. Glouton never sends mail from here: drafts and suggestions wait in the agent inbox. ' +
  'Deleting a company or a person asks the user first; when the client cannot ask, give the user the confirm_url.';

/** Glouton's MCP server and the confirm page's view of its pending actions. */
export interface GloutonMcp {
  server: Server;
  pending: McpPending;
}

/** Builds Glouton's MCP server: the contact tools, free for every account, and the two confirmed deletes. */
export function gloutonMcp(deps: McpDeps): GloutonMcp {
  const accessOf = (action: Pick<Action, 'userId' | 'clientId'>) =>
    accessForUser(deps.prisma, action.userId, action.clientId || 'mcp', 'free');
  const confirmations = new Confirmations({
    store: deps.store ?? new SqlPending((sql, params) => deps.prisma.$queryRawUnsafe(sql, ...params)),
    key: deps.confirmKey,
    confirmUrl: deps.confirmUrl,
    audit: deps.audit,
    kinds: {
      delete_company: {
        tool: 'glouton_company_delete',
        fingerprint: async (a) => digest((await found(contactService.findCompany(deps.prisma, await accessOf(a), a.target))).updatedAt.toISOString()),
        run: async (a) => void (await contactService.deleteCompany(deps.prisma, await accessOf(a), a.target, deps.hooks)),
      },
      delete_person: {
        tool: 'glouton_person_delete',
        fingerprint: async (a) => digest((await found(contactService.findPerson(deps.prisma, await accessOf(a), a.target))).updatedAt.toISOString()),
        run: async (a) => void (await contactService.deletePerson(deps.prisma, await accessOf(a), a.target)),
      },
    },
  });

  const server = newServer({
    name: 'glouton',
    title: 'Glouton',
    version: deps.version,
    instructions: INSTRUCTIONS,
    resource: deps.resource,
    issuer: deps.issuer,
    verifier: deps.verifier,
    audit: deps.audit,
    onError: deps.onError,
    rateLimit: deps.rateLimit,
    tools: [...readTools(deps), ...writeTools(deps), ...deleteTools(deps.prisma, confirmations)],
  });
  return { server, pending: confirmPage(confirmations) };
}

/** The two deletes. Each asks the person first and runs only on their answer. */
function deleteTools(prisma: PrismaClient, confirmations: Confirmations): Tool[] {
  const access = (caller: Caller) => accessForUser(prisma, caller.userId, caller.actor || caller.clientId || 'mcp', 'free');
  const pendingReply = (outcome: Outcome) => ({ status: STATUS_PENDING, confirm_url: outcome.confirmUrl, message: outcome.message });

  const deleteCompany = newTool<{ company_id: string }>({
    name: 'glouton_company_delete',
    title: 'Delete a company',
    description:
      'Deletes a Glouton company and hides its people, after the user confirms. A linked Ardoise client is only unlinked. ' +
      'company_id comes from glouton_contacts_search. When the client cannot ask the user, it returns a confirm_url to give them.',
    annotations: DELETE,
    inputSchema: {
      type: 'object',
      properties: { company_id: { type: 'string', minLength: 1, maxLength: 64, description: 'The company id' } },
      required: ['company_id'],
    },
  }, guarded('Call glouton_contacts_search to find valid ids.', async ({ company_id }, req) => {
    if (retrying(req.ctx)) {
      const resumed = await confirmations.resume(req, 'delete_company');
      return { status: resumed.status, message: resumed.message, company_id };
    }
    const company = await contactService.findCompany(prisma, await access(req.caller), company_id);
    const question = `Delete the company "${company.name}" and its people from Glouton?`;
    const { result, outcome } = await confirmations.request(req, 'delete_company', company.id, question);
    return result ?? pendingReply(outcome);
  }));

  const deletePerson = newTool<{ person_id: string }>({
    name: 'glouton_person_delete',
    title: 'Delete a person',
    description:
      'Deletes a Glouton person, after the user confirms. person_id comes from glouton_contacts_search or glouton_company_get. ' +
      'When the client cannot ask the user, it returns a confirm_url to give them.',
    annotations: DELETE,
    inputSchema: {
      type: 'object',
      properties: { person_id: { type: 'string', minLength: 1, maxLength: 64, description: 'The person id' } },
      required: ['person_id'],
    },
  }, guarded('Call glouton_contacts_search to find valid ids.', async ({ person_id }, req) => {
    if (retrying(req.ctx)) {
      const resumed = await confirmations.resume(req, 'delete_person');
      return { status: resumed.status, message: resumed.message, person_id };
    }
    const person = await contactService.findPerson(prisma, await access(req.caller), person_id);
    const name = [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email || person.id;
    const { result, outcome } = await confirmations.request(req, 'delete_person', person.id, `Delete the person "${name}" from Glouton?`);
    return result ?? pendingReply(outcome);
  }));

  return [deleteCompany, deletePerson];
}

/** The confirm page's view: the person's waiting actions with their state, confirm and dismiss. */
function confirmPage(confirmations: Confirmations): McpPending {
  const person = (userId: string): Caller => ({ userId, clientId: '', actor: '', subject: '', scopes: [] });
  return {
    async open(userId) {
      const actions = await confirmations.open(userId);
      return Promise.all(actions.map(async (a) => ({
        id: a.id, kind: a.kind, summary: a.summary, createdAt: a.createdAt, expiresAt: a.expiresAt, state: await confirmations.state(a),
      })));
    },
    confirm: async (userId, id) => void (await pageCall(() => confirmations.confirm(person(userId), id))),
    dismiss: (userId, id) => pageCall(() => confirmations.dismiss(person(userId), id)),
  };
}
