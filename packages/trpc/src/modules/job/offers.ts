import type { JobOfferStatus, PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { Scope } from '../../utils/scope';
import { scopeKey } from '../prospect/profile';

const notFound = () => new TRPCError({ code: 'NOT_FOUND', message: 'Offer not found' });

function scoped(scope: Scope) {
  return { scopeKey: scopeKey(scope) };
}

/** The scope's offers in one status, best first; narrowed to one search when given. */
export async function listOffers(prisma: PrismaClient, scope: Scope, options: { status?: JobOfferStatus; searchId?: string } = {}) {
  return prisma.jobOffer.findMany({
    where: { ...scoped(scope), status: options.status ?? 'NEW', ...(options.searchId ? { searchId: options.searchId } : {}) },
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    take: 300,
  });
}

/** New offers, and how many of them nobody has looked at yet. */
export async function offerCounts(prisma: PrismaClient, scope: Scope) {
  const where = { ...scoped(scope), status: 'NEW' as const };
  const [fresh, unseen] = await Promise.all([prisma.jobOffer.count({ where }), prisma.jobOffer.count({ where: { ...where, seenAt: null } })]);
  return { fresh, unseen };
}

export async function markOffersSeen(prisma: PrismaClient, scope: Scope, now = new Date()) {
  const result = await prisma.jobOffer.updateMany({ where: { ...scoped(scope), status: 'NEW', seenAt: null }, data: { seenAt: now } });
  return { updated: result.count };
}

async function decide(prisma: PrismaClient, scope: Scope, offerId: string, from: JobOfferStatus, to: JobOfferStatus, now: Date) {
  const row = await prisma.jobOffer.findFirst({ where: { id: offerId, ...scoped(scope) } });
  if (!row) throw notFound();
  const result = await prisma.jobOffer.updateMany({ where: { id: row.id, status: from }, data: { status: to, decidedAt: to === 'NEW' ? null : now } });
  if (result.count === 0) throw new TRPCError({ code: 'CONFLICT', message: 'Offer already decided' });
  return row;
}

/** Hides an offer. It stays stored, so the same address never comes back. */
export async function dismissOffer(prisma: PrismaClient, scope: Scope, offerId: string, now = new Date()) {
  const row = await decide(prisma, scope, offerId, 'NEW', 'DISMISSED', now);
  return { offerId: row.id };
}

export async function restoreOffer(prisma: PrismaClient, scope: Scope, offerId: string, now = new Date()) {
  const row = await decide(prisma, scope, offerId, 'DISMISSED', 'NEW', now);
  return { offerId: row.id };
}

/** Saves an offer as an application to send, copying what the offer says so the application outlives it. */
export async function saveOffer(prisma: PrismaClient, scope: Scope, offerId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.jobOffer.findFirst({ where: { id: offerId, ...scoped(scope) } });
    if (!row) throw notFound();
    const claimed = await tx.jobOffer.updateMany({ where: { id: row.id, status: 'NEW' }, data: { status: 'SAVED', decidedAt: now } });
    if (claimed.count === 0) throw new TRPCError({ code: 'CONFLICT', message: 'Offer already decided' });
    const application = await tx.jobApplication.create({
      data: {
        userId: scope.userId,
        teamId: scope.type === 'team' ? scope.teamId : null,
        offerId: row.id,
        title: row.title,
        company: row.company,
        url: row.url,
        location: row.location,
        description: row.description || null,
        links: [row.url],
      },
    });
    return { offerId: row.id, applicationId: application.id };
  });
}
