import type { PrismaClient } from '@prisma/client';
import { buildLeadFilter, type Scope } from '../../utils/scope';
import { winRate, type WinRate } from './rules';

/** Won and lost deal counts per competitor id, inside one scope. */
export async function winRates(prisma: PrismaClient, scope: Scope, ids: string[]): Promise<Map<string, WinRate>> {
  const leads = buildLeadFilter(scope);
  const [won, lost] = await Promise.all([
    prisma.lead.groupBy({
      by: ['wonAgainstCompetitorId'],
      where: { ...leads, outcome: 'WON', wonAgainstCompetitorId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ['lostToCompetitorId'],
      where: { ...leads, outcome: 'LOST', lostToCompetitorId: { in: ids } },
      _count: { _all: true },
    }),
  ]);
  const wins = new Map(won.map((row) => [row.wonAgainstCompetitorId, row._count._all]));
  const losses = new Map(lost.map((row) => [row.lostToCompetitorId, row._count._all]));
  return new Map(ids.map((id) => [id, winRate(wins.get(id) ?? 0, losses.get(id) ?? 0)]));
}
