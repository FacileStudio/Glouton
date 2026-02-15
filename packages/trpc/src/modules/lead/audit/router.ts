import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../../../trpc';
import leadService from '../service';
import {
  auditStatusSchema,
  cancelAuditSchema,
  deleteAuditSchema,
} from '../schemas';

export const auditRouter = router({
  start: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const result = await leadService.startAudit({
        userId: ctx.user.id,
        jobs: ctx.jobs,
        db: ctx.db,
      });

      ctx.log.info({
        action: 'start-audit',
        auditSessionId: result.auditSessionId,
      });

      return result;
    } catch (error) {
      ctx.log.error({
        action: 'start-audit-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Failed to start audit session',
        cause: error,
      });
    }
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      const sessions = await leadService.getAuditSessions(ctx.user.id, ctx.db, ctx.jobs);
      return sessions;
    } catch (error) {
      ctx.log.error({
        action: 'get-audit-sessions-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve audit sessions',
        cause: error,
      });
    }
  }),

  getStatus: protectedProcedure.input(auditStatusSchema).query(async ({ ctx, input }) => {
    try {
      const session = await leadService.getAuditSessionStatus(input.auditSessionId, ctx.db);

      /**
       * if
       */
      if (session.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this audit session',
        });
      }

      return session;
    } catch (error) {
      /**
       * if
       */
      if (error instanceof TRPCError) {
        throw error;
      }

      ctx.log.error({
        action: 'get-audit-status-failed',
        auditSessionId: input.auditSessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'NOT_FOUND',
        message: error instanceof Error ? error.message : 'Audit session not found',
        cause: error,
      });
    }
  }),

  cancel: protectedProcedure.input(cancelAuditSchema).mutation(async ({ ctx, input }) => {
    try {
      const updatedSession = await leadService.cancelAudit(input.auditSessionId, ctx.user.id, ctx.db, ctx.jobs);

      ctx.log.info({
        action: 'cancel-audit',
        auditSessionId: input.auditSessionId,
      });

      return updatedSession;
    } catch (error) {
      /**
       * if
       */
      if (error instanceof TRPCError) {
        throw error;
      }

      ctx.log.error({
        action: 'cancel-audit-failed',
        auditSessionId: input.auditSessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Failed to cancel audit session',
        cause: error,
      });
    }
  }),

  delete: protectedProcedure.input(deleteAuditSchema).mutation(async ({ ctx, input }) => {
    try {
      await leadService.deleteAudit(input.auditSessionId, ctx.user.id, ctx.db);

      ctx.log.info({
        action: 'delete-audit',
        auditSessionId: input.auditSessionId,
      });

      return { success: true };
    } catch (error) {
      /**
       * if
       */
      if (error instanceof TRPCError) {
        throw error;
      }

      ctx.log.error({
        action: 'delete-audit-failed',
        auditSessionId: input.auditSessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Failed to delete audit session',
        cause: error,
      });
    }
  }),
});
