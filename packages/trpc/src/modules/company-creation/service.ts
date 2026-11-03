import { type PrismaClient, type Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { mirrorLeadsSafely } from '@repo/database/contacts';
import { QueueManager } from '@repo/jobs';
import type {
  ListCompanyCreationsInput,
  GetCompanyCreationInput,
  ConvertToLeadInput,
} from './schemas';

export default {
  async list({
    prisma,
    input,
  }: {
    prisma: PrismaClient;
    input: ListCompanyCreationsInput;
  }) {
    const {
      page,
      limit,
      country,
      search,
      hasWebsite,
      activityCode,
      postalCode,
      publishedAfter,
      publishedBefore,
      sortBy,
      sortOrder,
    } = input;

    const skip = (page - 1) * limit;
    const where: Prisma.CompanyCreationWhereInput = {};

    if (country) {
      where.country = country;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { registrationId: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { activityLabel: { contains: search, mode: 'insensitive' } },
        { domain: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (hasWebsite !== undefined) {
      where.hasWebsite = hasWebsite;
    }

    if (activityCode) {
      where.activityCode = { startsWith: activityCode, mode: 'insensitive' };
    }

    if (postalCode) {
      where.postalCode = { startsWith: postalCode };
    }

    if (publishedAfter || publishedBefore) {
      where.publishedAt = {};
      if (publishedAfter) {
        where.publishedAt.gte = new Date(publishedAfter);
      }
      if (publishedBefore) {
        where.publishedAt.lte = new Date(publishedBefore);
      }
    }

    const [items, total] = await Promise.all([
      prisma.companyCreation.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      prisma.companyCreation.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async getById({
    prisma,
    input,
  }: {
    prisma: PrismaClient;
    input: GetCompanyCreationInput;
  }) {
    return prisma.companyCreation.findUnique({
      where: { id: input.id },
      include: {
        lead: true,
      },
    });
  },

  async getStats({ prisma }: { prisma: PrismaClient }) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [total, withoutWebsite, fr, gb, de, newToday] = await Promise.all([
      prisma.companyCreation.count(),
      prisma.companyCreation.count({ where: { hasWebsite: false } }),
      prisma.companyCreation.count({ where: { country: 'FR' } }),
      prisma.companyCreation.count({ where: { country: 'GB' } }),
      prisma.companyCreation.count({ where: { country: 'DE' } }),
      prisma.companyCreation.count({ where: { publishedAt: { gte: oneDayAgo } } }),
    ]);

    return {
      total,
      withoutWebsite,
      byCountry: {
        FR: fr,
        GB: gb,
        DE: de,
      },
      newToday,
    };
  },

  async convertToLead({
    prisma,
    input,
    userId,
  }: {
    prisma: PrismaClient;
    input: ConvertToLeadInput;
    userId: string;
  }) {
    const creation = await prisma.companyCreation.findUnique({
      where: { id: input.creationId },
    });

    if (!creation) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Company creation not found',
      });
    }

    if (creation.convertedLeadId) {
      return { success: true, leadId: creation.convertedLeadId };
    }

    const category =
      creation.activityLabel || creation.activityCode || "Création d'entreprise";
    const businessType = creation.domain ? 'DOMAIN' : 'LOCAL_BUSINESS';
    const status = creation.hasWebsite ? 'WARM' : 'HOT';
    const score = creation.hasWebsite ? 50 : 85;

    const lead = await prisma.$transaction(async (tx) => {
      const createdLead = await tx.lead.create({
        data: {
          userId,
          teamId: input.teamId || null,
          businessName: creation.name,
          businessType,
          source: 'COMPANY_CREATION',
          sourceId: creation.registrationId,
          domain: creation.domain || null,
          email: creation.email || null,
          country: creation.country,
          city: creation.city,
          category,
          physicalAddresses: creation.address ? [creation.address] : [],
          phoneNumbers: creation.phone ? [creation.phone] : [],
          status,
          score,
          hasWebsite: creation.hasWebsite,
          metadata: {
            creationId: creation.id,
            legalForm: creation.legalForm,
            capital: creation.capital,
            directors: creation.directors as Prisma.InputJsonValue,
          },
        },
      });

      await tx.companyCreation.update({
        where: { id: creation.id },
        data: {
          convertedLeadId: createdLead.id,
          convertedAt: new Date(),
        },
      });

      return createdLead;
    });

    await mirrorLeadsSafely(prisma, { id: lead.id }, { origin: 'HUNT' });
    if (creation.country === 'FR') {
      await prisma.company.updateMany({
        where: { legacyLeadId: lead.id, siret: null },
        data: { siret: creation.registrationId, legalName: creation.name },
      });
    }

    return { success: true, leadId: lead.id };
  },

  async triggerScrape(opts?: { jobs?: QueueManager }) {
    const queueManager = opts?.jobs ?? QueueManager.getInstance();
    await queueManager.addJob(
      'company-creation',
      'company-creation-manual',
      { triggeredBy: 'manual' }
    );
    return { success: true };
  },
};
