import type { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { buildCompetitorFilter, resolveScope, type Scope } from '../../utils/scope';
import type { PlanMode } from '../forfait/gate';
import { ClosureError, closure } from './rules';
import type { CloseLeadInput } from './schemas';
import { notFound } from './service';

/** Loads a lead and checks the caller owns it or belongs to its team; anything else reads as not found. */
async function loadLead(prisma: PrismaClient, userId: string, leadId: string, mode: PlanMode, declaredTeamId?: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, userId: true, teamId: true } });
  if (!lead) throw notFound('Lead not found');
  if (lead.teamId) {
    if (declaredTeamId && declaredTeamId !== lead.teamId) throw notFound('Lead not found');
    return { lead, scope: await resolveScope(prisma, userId, lead.teamId, mode) };
  }
  if (declaredTeamId || lead.userId !== userId) throw notFound('Lead not found');
  return { lead, scope: { type: 'personal', userId } as Scope };
}

/**
 * Closes a lead as won or lost. The rules in `closure` decide which fields
 * are required; a named competitor must belong to the lead's own scope.
 */
export async function closeLead(prisma: PrismaClient, userId: string, mode: PlanMode, input: CloseLeadInput) {
  const { lead, scope } = await loadLead(prisma, userId, input.leadId, mode, input.teamId);
  let columns;
  try {
    columns = closure(input);
  } catch (error) {
    if (error instanceof ClosureError) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
    throw error;
  }
  const competitorId = columns.lostToCompetitorId ?? columns.wonAgainstCompetitorId;
  if (competitorId) {
    const found = await prisma.competitor.count({ where: { ...buildCompetitorFilter(scope), id: competitorId } });
    if (found === 0) throw notFound();
  }
  return prisma.lead.update({
    where: { id: lead.id },
    data: { ...columns, closedAt: new Date() },
    select: {
      id: true,
      outcome: true,
      closedAt: true,
      lossReason: true,
      lostToCompetitorId: true,
      competitorLossReason: true,
      wonAgainstCompetitorId: true,
    },
  });
}

/** Clears a lead's outcome so it is open again. */
export async function reopenLead(prisma: PrismaClient, userId: string, mode: PlanMode, leadId: string, teamId?: string) {
  const { lead } = await loadLead(prisma, userId, leadId, mode, teamId);
  return prisma.lead.update({
    where: { id: lead.id },
    data: {
      outcome: null,
      closedAt: null,
      lossReason: null,
      lostToCompetitorId: null,
      competitorLossReason: null,
      wonAgainstCompetitorId: null,
    },
    select: { id: true, outcome: true },
  });
}
