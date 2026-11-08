import type { Competitor, Prisma, PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { buildCompetitorFilter, buildLeadFilter, resolveScope, type Scope } from '../../utils/scope';
import type { PlanMode } from '../forfait/gate';
import { cleanTags, domainOf, objectionsOf, winRate, type WinRate } from './rules';
import { winRates } from './stats';
import type { Objection } from './schemas';

export const notFound = (what = 'Competitor not found') => new TRPCError({ code: 'NOT_FOUND', message: what });

/** The fields a create or update may write, as the router parsed them. */
export interface CompetitorFields {
  name?: string;
  website?: string | null;
  area?: string | null;
  nafCodes?: string[];
  tags?: string[];
  notes?: string | null;
  status?: 'ACTIVE' | 'ARCHIVED';
  overview?: string | null;
  whyWeWin?: string[];
  whyWeLose?: string[];
  objections?: Objection[];
  landmines?: string[];
  pricing?: string | null;
  proofPoints?: string[];
}

/** A competitor as the API returns it: typed objections and its win rate. */
export type CompetitorView = Omit<Competitor, 'objections'> & { objections: Objection[]; winRate: WinRate };

/** Maps parsed fields to Prisma data, deriving the domain from the website. */
function toData(fields: CompetitorFields): Prisma.CompetitorUncheckedUpdateInput {
  const { objections, tags, website, ...rest } = fields;
  const data: Prisma.CompetitorUncheckedUpdateInput = { ...rest };
  if (website !== undefined) {
    data.website = website || null;
    data.domain = domainOf(website);
  }
  if (tags !== undefined) data.tags = cleanTags(tags);
  if (objections !== undefined) data.objections = objections as unknown as Prisma.InputJsonValue;
  return data;
}

/** Adds typed objections and the win rate to stored rows. */
async function present(prisma: PrismaClient, scope: Scope, rows: Competitor[]): Promise<CompetitorView[]> {
  const rates = await winRates(prisma, scope, rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, objections: objectionsOf(row.objections), winRate: rates.get(row.id) ?? winRate(0, 0) }));
}

/**
 * Loads one competitor and the scope it lives in, after checking the caller
 * may use that scope. Someone else's personal competitor, or one outside a
 * declared team, reads as not found.
 */
export async function loadCompetitor(
  prisma: PrismaClient,
  userId: string,
  competitorId: string,
  mode: PlanMode,
  declaredTeamId?: string
): Promise<{ row: Competitor; scope: Scope }> {
  const row = await prisma.competitor.findUnique({ where: { id: competitorId } });
  if (!row) throw notFound();
  if (row.teamId) {
    if (declaredTeamId && declaredTeamId !== row.teamId) throw notFound();
    return { row, scope: await resolveScope(prisma, userId, row.teamId, mode) };
  }
  if (declaredTeamId || row.userId !== userId) throw notFound();
  return { row, scope: { type: 'personal', userId } };
}

/** Lists a scope's competitors, filtered by text, tag and status, with every tag in use. */
export async function listCompetitors(
  prisma: PrismaClient,
  scope: Scope,
  filters: { q?: string; tag?: string; status?: 'ACTIVE' | 'ARCHIVED' }
) {
  const base = buildCompetitorFilter(scope);
  const where: Prisma.CompetitorWhereInput = { ...base };
  if (filters.status) where.status = filters.status;
  if (filters.tag) where.tags = { has: filters.tag };
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: 'insensitive' } },
      { domain: { contains: filters.q, mode: 'insensitive' } },
      { area: { contains: filters.q, mode: 'insensitive' } },
      { tags: { has: filters.q } },
    ];
  }
  const [rows, tagged] = await Promise.all([
    prisma.competitor.findMany({ where, orderBy: [{ status: 'asc' }, { name: 'asc' }] }),
    prisma.competitor.findMany({ where: base, select: { tags: true } }),
  ]);
  const tags = Array.from(new Set(tagged.flatMap((row) => row.tags))).sort((a, b) => a.localeCompare(b));
  return { items: await present(prisma, scope, rows), tags };
}

/** One competitor with its win rate, the loss reasons against it, and the leads won and lost against it. */
export async function getCompetitor(prisma: PrismaClient, row: Competitor, scope: Scope) {
  const [view] = await present(prisma, scope, [row]);
  const leads = buildLeadFilter(scope);
  const select = {
    id: true,
    businessName: true,
    domain: true,
    firstName: true,
    lastName: true,
    closedAt: true,
    competitorLossReason: true,
  } as const;
  const [wonLeads, lostLeads, reasons] = await Promise.all([
    prisma.lead.findMany({ where: { ...leads, outcome: 'WON', wonAgainstCompetitorId: row.id }, select, orderBy: { closedAt: 'desc' }, take: 50 }),
    prisma.lead.findMany({ where: { ...leads, outcome: 'LOST', lostToCompetitorId: row.id }, select, orderBy: { closedAt: 'desc' }, take: 50 }),
    prisma.lead.groupBy({
      by: ['competitorLossReason'],
      where: { ...leads, outcome: 'LOST', lostToCompetitorId: row.id },
      _count: { _all: true },
    }),
  ]);
  const lossReasons = reasons
    .filter((entry) => entry.competitorLossReason)
    .map((entry) => ({ reason: entry.competitorLossReason!, count: entry._count._all }))
    .sort((a, b) => b.count - a.count);
  return { ...view!, wonLeads, lostLeads, lossReasons };
}

/** Two to four competitors of one scope, in the order asked; any id outside the scope fails the whole call. */
export async function compareCompetitors(prisma: PrismaClient, scope: Scope, ids: string[]) {
  const unique = Array.from(new Set(ids));
  const rows = await prisma.competitor.findMany({ where: { ...buildCompetitorFilter(scope), id: { in: unique } } });
  if (rows.length !== unique.length) throw notFound();
  const views = await present(prisma, scope, rows);
  return unique.map((id) => views.find((view) => view.id === id)!);
}

/** Creates a competitor in a scope. */
export async function createCompetitor(prisma: PrismaClient, scope: Scope, fields: CompetitorFields & { name: string }) {
  const row = await prisma.competitor.create({
    data: {
      ...(toData(fields) as Prisma.CompetitorUncheckedCreateInput),
      name: fields.name,
      userId: scope.userId,
      teamId: scope.type === 'team' ? scope.teamId : null,
    },
  });
  const [view] = await present(prisma, scope, [row]);
  return view!;
}

/** Updates the given fields of a loaded competitor. */
export async function updateCompetitor(prisma: PrismaClient, row: Competitor, scope: Scope, fields: CompetitorFields) {
  const updated = await prisma.competitor.update({ where: { id: row.id }, data: toData(fields) });
  const [view] = await present(prisma, scope, [updated]);
  return view!;
}
