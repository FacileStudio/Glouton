import { router, protectedProcedure } from '../../../trpc';
import FavoriteService from './service';
import { resolveScope } from '../../../utils/scope';
import { z } from 'zod';

const toggleFavoriteSchema = z.object({
  leadId: z.string().uuid('Invalid lead ID'),
});

const isFavoriteSchema = z.object({
  leadId: z.string().uuid('Invalid lead ID'),
});

const getFavoritesSchema = z.object({
  teamId: z.string().uuid().optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional(),
}).optional();

export const favoriteRouter = router({
  toggle: protectedProcedure
    .input(toggleFavoriteSchema)
    .mutation(async ({ ctx, input }) => {
      return await FavoriteService.toggleFavorite(
        ctx.user.id,
        input.leadId,
        ctx.prisma
      );
    }),

  list: protectedProcedure
    .input(getFavoritesSchema)
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.prisma, ctx.user.id, input?.teamId);
      return await FavoriteService.getFavorites({
        scope,
        prisma: ctx.prisma,
        page: input?.page,
        limit: input?.limit,
      });
    }),

  isFavorite: protectedProcedure
    .input(isFavoriteSchema)
    .query(async ({ ctx, input }) => {
      return await FavoriteService.isFavorite(
        ctx.user.id,
        input.leadId,
        ctx.prisma
      );
    }),
});
