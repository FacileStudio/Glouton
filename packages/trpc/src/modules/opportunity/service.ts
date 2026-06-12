import { type PrismaClient, type Prisma } from '@prisma/client';
import type { QueueManager } from '@repo/jobs';
import type { ListOpportunitiesInput } from './schemas';

function tierFromScore(score: number): 'HOT' | 'WARM' | 'COLD' {
  if (score >= 55) return 'HOT';
  if (score >= 25) return 'WARM';
  return 'COLD';
}

export default {
  async list({ prisma, input }: { prisma: PrismaClient; input: ListOpportunitiesInput }) {
    const { page, limit, search, tier, category, source, remoteOnly, minScore, sortBy, sortOrder } = input;
    const skip = (page - 1) * limit;

    const where: Prisma.OpportunityWhereInput = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (tier) {
      const ranges: Record<string, { gte?: number; lt?: number }> = {
        HOT: { gte: 55 },
        WARM: { gte: 25, lt: 55 },
        COLD: { lt: 25 },
      };
      where.relevanceScore = ranges[tier];
    }

    if (minScore !== undefined) {
      where.relevanceScore = { ...(where.relevanceScore as object ?? {}), gte: minScore };
    }

    if (category) where.category = category as any;
    if (source) where.sourcePlatform = source as any;
    if (remoteOnly) where.isRemote = true;

    // Only show jobs posted in the last 30 days
    where.postedAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };

    // Nullable sort fields: push the rows without a value to the end
    // instead of letting them dominate the first pages.
    const nullableSortFields = new Set(['budgetMax', 'applicantCount']);
    const orderBy: Prisma.OpportunityOrderByWithRelationInput = nullableSortFields.has(sortBy)
      ? { [sortBy]: { sort: sortOrder, nulls: 'last' } }
      : { [sortBy]: sortOrder };

    const [opportunities, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          company: true,
          sourcePlatform: true,
          sourceUrl: true,
          category: true,
          tags: true,
          budget: true,
          budgetMin: true,
          budgetMax: true,
          currency: true,
          location: true,
          isRemote: true,
          postedAt: true,
          relevanceScore: true,
          applicantCount: true,
          companyLogo: true,
          contractType: true,
          experienceLevel: true,
          duration: true,
          createdAt: true,
        },
      }),
      prisma.opportunity.count({ where }),
    ]);

    return {
      opportunities: opportunities.map((o) => ({ ...o, tier: tierFromScore(o.relevanceScore) })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },

  async getStats({ prisma }: { prisma: PrismaClient }) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const today = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [total, hot, warm, newToday] = await Promise.all([
      prisma.opportunity.count({ where: { postedAt: { gte: since } } }),
      prisma.opportunity.count({ where: { postedAt: { gte: since }, relevanceScore: { gte: 55 } } }),
      prisma.opportunity.count({ where: { postedAt: { gte: since }, relevanceScore: { gte: 25, lt: 55 } } }),
      prisma.opportunity.count({ where: { createdAt: { gte: today } } }),
    ]);

    return { total, hot, warm, cold: total - hot - warm, newToday };
  },

  async getById({ prisma, input, userId }: { prisma: PrismaClient; input: { id: string }; userId: string }) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: input.id },
    });

    if (!opportunity) return null;

    // Track that the user opened the detail page
    await prisma.opportunityView.upsert({
      where: { userId_opportunityId: { userId, opportunityId: input.id } },
      create: { userId, opportunityId: input.id },
      update: { viewedAt: new Date() },
    }).catch(() => {});

    return { ...opportunity, tier: tierFromScore(opportunity.relevanceScore) };
  },

  async markClicked({ prisma, input, userId }: { prisma: PrismaClient; input: { id: string }; userId: string }) {
    await prisma.opportunityView.upsert({
      where: { userId_opportunityId: { userId, opportunityId: input.id } },
      create: { userId, opportunityId: input.id, clickedUrl: true },
      update: { clickedUrl: true },
    });
    return { success: true };
  },

  async triggerScrape({ jobs }: { jobs: QueueManager }) {
    // Shared 10-minute cooldown: the time-bucketed jobId makes BullMQ ignore
    // duplicate manual triggers while a run from the same window still exists.
    const cooldownMs = 10 * 60 * 1000;
    const bucket = Math.floor(Date.now() / cooldownMs);
    const jobId = `manual-${bucket}`;

    // Tell the caller when the trigger is a no-op (cooldown hit), so the UI
    // doesn't wait for progress events that will never come.
    const existing = await jobs.getJob('opportunity-scraper', jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') {
        return { queued: false, alreadyRan: true };
      }
      return { queued: false, alreadyRunning: true };
    }

    await jobs.addJob('opportunity-scraper', 'opportunity-scraper', { triggeredBy: 'manual' }, {
      jobId,
      removeOnComplete: { age: cooldownMs / 1000 },
      removeOnFail: { age: cooldownMs / 1000 },
    });
    return { queued: true };
  },
};
