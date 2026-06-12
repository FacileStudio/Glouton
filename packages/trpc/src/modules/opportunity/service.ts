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

    const [opportunities, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
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

  async triggerScrape({ jobs }: { jobs: QueueManager }) {
    // Shared 10-minute cooldown: the time-bucketed jobId makes BullMQ ignore
    // duplicate manual triggers while a run from the same window still exists.
    const cooldownMs = 10 * 60 * 1000;
    const bucket = Math.floor(Date.now() / cooldownMs);
    await jobs.addJob('opportunity-scraper', 'opportunity-scraper', { triggeredBy: 'manual' }, {
      jobId: `manual-${bucket}`,
      removeOnComplete: { age: cooldownMs / 1000 },
      removeOnFail: { age: cooldownMs / 1000 },
    });
    return { queued: true };
  },
};
