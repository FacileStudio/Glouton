import { Hono, type Context } from 'hono';
import type { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { z, ZodError } from 'zod';
import type { SessionUser } from '@repo/auth';
import {
  accessForUser,
  contactSchemas,
  contactService,
  draftCreateSchema,
  draftUpdateSchema,
  hasScope,
  inboxService,
  requiredScope,
  suggestionCreateSchema,
  suggestionStatusSchema,
  type DelegatedVerifier,
} from '@repo/trpc';

export interface AgentDeps {
  prisma: PrismaClient;
  verifySession: (token: string) => Promise<SessionUser | null>;
  verifyDelegated: DelegatedVerifier | null;
  notify?: inboxService.Notify;
}

interface Caller {
  user: SessionUser;
  actor: string | null;
  scopes: string[] | null;
}

type AgentEnv = { Variables: { caller: Caller } };

const STATUS: Record<string, 400 | 401 | 403 | 404 | 409 | 500> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

function fail(c: Context, status: 400 | 401 | 403 | 404 | 409 | 500, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}

const listQuerySchema = z.object({
  q: z.string().max(200).optional(),
  stage: contactSchemas.contactStageSchema.optional(),
  temperature: contactSchemas.temperatureSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const outreachQuerySchema = z.object({
  companyId: z.string().optional(),
  personId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const companyPatchSchema = contactSchemas.companyUpdateSchema.pick({
  name: true,
  domain: true,
  website: true,
  city: true,
  country: true,
  stage: true,
  notes: true,
  temperature: true,
  score: true,
});

const agentCompanyCreateSchema = contactSchemas.companyCreateSchema.pick({
  name: true,
  domain: true,
  website: true,
  city: true,
  country: true,
  stage: true,
  notes: true,
  teamId: true,
  people: true,
});

/**
 * The agent REST surface under /api/agent. It accepts a Registre delegated
 * token or a Glouton session JWT, needs glouton.read for GET and
 * glouton.write for the rest, and has no route that sends mail.
 */
export function createAgentRoutes(deps: AgentDeps) {
  const routes = new Hono<AgentEnv>();

  routes.use('*', async (c, next) => {
    const header = c.req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return fail(c, 401, 'UNAUTHORIZED', 'Missing bearer token');

    const session = await deps.verifySession(token);
    const delegated = session || !deps.verifyDelegated ? null : await deps.verifyDelegated(token);
    const user = session ?? delegated?.user;
    if (!user) return fail(c, 401, 'UNAUTHORIZED', 'Invalid or expired token');

    const caller: Caller = { user, actor: delegated?.actor ?? null, scopes: delegated?.scopes ?? null };
    if (!hasScope(caller.scopes, requiredScope(c.req.method))) {
      return fail(c, 403, 'FORBIDDEN', `This token lacks the ${requiredScope(c.req.method)} scope`);
    }
    c.set('caller', caller);
    await next();
  });

  routes.onError((error, c) => {
    if (error instanceof ZodError) {
      return fail(c, 400, 'VALIDATION', error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    if (error instanceof SyntaxError) return fail(c, 400, 'BAD_REQUEST', 'Body is not valid JSON');
    if (error instanceof TRPCError) {
      return fail(c, STATUS[error.code] ?? 500, error.code, error.message);
    }
    return fail(c, 500, 'INTERNAL', 'Something went wrong');
  });

  const access = (c: Context<AgentEnv>) => {
    const caller = c.get('caller');
    return accessForUser(deps.prisma, caller.user.id, caller.actor);
  };
  const body = async <T extends z.ZodTypeAny>(c: Context<AgentEnv>, schema: T): Promise<z.infer<T>> =>
    schema.parse(await c.req.json());

  routes.get('/contacts', async (c) => {
    const query = listQuerySchema.parse(c.req.query());
    const data = await contactService.searchContacts(deps.prisma, await access(c), { ...query, offset: 0 });
    return c.json({ data });
  });

  routes.get('/companies/:id', async (c) => {
    const { websiteAudit: _audit, ...company } = await contactService.getCompany(
      deps.prisma,
      await access(c),
      c.req.param('id')
    );
    return c.json({ data: company });
  });

  routes.get('/people/:id', async (c) => {
    const data = await contactService.getPerson(deps.prisma, await access(c), c.req.param('id'));
    return c.json({ data });
  });

  routes.get('/outreach', async (c) => {
    const query = outreachQuerySchema.parse(c.req.query());
    const rows = await contactService.listOutreach(deps.prisma, await access(c), query, query.limit);
    const data = rows.map((r) => ({
      id: r.id,
      status: r.status,
      subject: r.subject,
      origin: r.origin,
      personId: r.personId,
      companyId: r.companyId,
      sentAt: r.sentAt,
      repliedAt: r.repliedAt,
      createdAt: r.createdAt,
    }));
    return c.json({ data });
  });

  routes.post('/companies', async (c) => {
    const input = await body(c, agentCompanyCreateSchema);
    const data = await contactService.createCompany(deps.prisma, await access(c), input, 'AGENT');
    return c.json({ data }, 201);
  });

  routes.patch('/companies/:id', async (c) => {
    const input = await body(c, companyPatchSchema);
    const data = await contactService.updateCompany(deps.prisma, await access(c), c.req.param('id'), input);
    return c.json({ data });
  });

  routes.post('/people', async (c) => {
    const input = await body(c, contactSchemas.personCreateSchema);
    const data = await contactService.createPerson(deps.prisma, await access(c), input, 'AGENT');
    return c.json({ data }, 201);
  });

  routes.patch('/people/:id', async (c) => {
    const input = await body(c, contactSchemas.personUpdateSchema);
    const data = await contactService.updatePerson(deps.prisma, await access(c), c.req.param('id'), input);
    return c.json({ data });
  });

  routes.post('/drafts', async (c) => {
    const input = await body(c, draftCreateSchema);
    const data = await inboxService.createDraft(deps.prisma, await access(c), input, deps.notify);
    return c.json({ data }, 201);
  });

  routes.patch('/drafts/:id', async (c) => {
    const input = await body(c, draftUpdateSchema);
    const data = await inboxService.updateDraft(deps.prisma, await access(c), c.req.param('id'), input);
    return c.json({ data });
  });

  routes.post('/suggestions', async (c) => {
    const input = await body(c, suggestionCreateSchema);
    const data = await inboxService.createSuggestion(
      deps.prisma,
      await access(c),
      { ...input, payload: input.payload as inboxService.SuggestionInput['payload'] },
      deps.notify
    );
    return c.json({ data }, 201);
  });

  routes.get('/suggestions', async (c) => {
    const status = suggestionStatusSchema.default('OPEN').parse(c.req.query('status'));
    const data = await inboxService.listSuggestions(deps.prisma, await access(c), status);
    return c.json({ data });
  });

  routes.notFound((c) => fail(c, 404, 'NOT_FOUND', 'No such agent route'));

  return routes;
}
