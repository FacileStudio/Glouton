import { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { buildLeadFilter, type Scope } from '../../../utils/scope';
import {
  paginationParams,
  calculatePagination,
} from '@repo/database/utils/prisma-helpers';

export interface Context {
  user: { id: string };
  prisma: PrismaClient;
  log: {
    info: (data: any) => void;
    error: (data: any) => void;
  };
}

export interface GetFavoritesParams {
  scope: Scope;
  prisma: PrismaClient;
  page?: number;
  limit?: number;
}

export default {
  async toggleFavorite(userId: string, leadId: string, prisma: PrismaClient) {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          userId: true,
          teamId: true,
        },
      });

      if (!lead) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Lead not found',
        });
      }

      const isOwner = lead.userId === userId;
      let isTeamMember = false;

      if (lead.teamId) {
        const teamMembership = await prisma.teamMember.findFirst({
          where: {
            teamId: lead.teamId,
            userId: userId,
          },
        });
        isTeamMember = !!teamMembership;
      }

      if (!isOwner && !isTeamMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this lead',
        });
      }

      const existingFavorite = await prisma.userFavoriteLead.findUnique({
        where: {
          userId_leadId: {
            userId,
            leadId,
          },
        },
      });

      if (existingFavorite) {
        await prisma.userFavoriteLead.delete({
          where: {
            id: existingFavorite.id,
          },
        });

        return {
          isFavorite: false,
          message: 'Lead removed from favorites',
        };
      } else {
        await prisma.userFavoriteLead.create({
          data: {
            userId,
            leadId,
          },
        });

        return {
          isFavorite: true,
          message: 'Lead added to favorites',
        };
      }
    } catch (error) {
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to toggle favorite status',
      });
    }
  },

  async getFavorites({ scope, prisma, page, limit }: GetFavoritesParams) {
    try {
      const baseFilter = buildLeadFilter(scope);
      const pagination = paginationParams(page, limit);

      let favoriteUserIds: string[] = [scope.userId];

      if (scope.type === 'team') {
        const teamMembers = await prisma.teamMember.findMany({
          where: { teamId: scope.teamId },
          select: { userId: true },
        });
        favoriteUserIds = teamMembers.map(tm => tm.userId);
      }

      const where = {
        ...baseFilter,
        favoritedBy: {
          some: {
            userId: {
              in: favoriteUserIds,
            },
          },
        },
      };

      const [leads, total] = await Promise.all([
        prisma.lead.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: pagination.skip,
          take: pagination.take,
          select: {
            id: true,
            domain: true,
            email: true,
            firstName: true,
            lastName: true,
            businessName: true,
            city: true,
            country: true,
            status: true,
            score: true,
            technologies: true,
            additionalEmails: true,
            phoneNumbers: true,
            physicalAddresses: true,
            socialProfiles: true,
            companyInfo: true,
            websiteAudit: true,
            scrapedAt: true,
            auditedAt: true,
            huntSessionId: true,
            contacted: true,
            lastContactedAt: true,
            emailsSentCount: true,
            createdAt: true,
            coordinates: true,
            hasWebsite: true,
            businessType: true,
            category: true,
          },
        }),
        prisma.lead.count({ where }),
      ]);

      const paginationMeta = calculatePagination(
        total,
        page ?? 1,
        limit ?? 50
      );

      return {
        leads,
        pagination: {
          page: paginationMeta.page,
          limit: paginationMeta.limit,
          total: paginationMeta.total,
          totalPages: paginationMeta.totalPages,
        },
      };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve favorite leads',
      });
    }
  },

  async isFavorite(scope: Scope, leadId: string, prisma: PrismaClient) {
    try {
      let favoriteUserIds: string[] = [scope.userId];

      if (scope.type === 'team') {
        const teamMembers = await prisma.teamMember.findMany({
          where: { teamId: scope.teamId },
          select: { userId: true },
        });
        favoriteUserIds = teamMembers.map(tm => tm.userId);
      }

      const favorite = await prisma.userFavoriteLead.findFirst({
        where: {
          leadId,
          userId: {
            in: favoriteUserIds,
          },
        },
      });

      return {
        isFavorite: !!favorite,
      };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to check favorite status',
      });
    }
  },
};
