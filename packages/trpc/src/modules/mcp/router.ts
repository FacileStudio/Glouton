import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, sessionProcedure } from '../../trpc';
import type { Context } from '../../context';

/** One MCP action waiting for its person, as the confirm page shows it. */
export interface PendingAction {
  id: string;
  kind: string;
  summary: string;
  createdAt: Date;
  expiresAt: Date;
  /** ready, changed (the target moved since the question) or missing (the target is gone). */
  state: string;
}

/** The person-facing side of the MCP confirmations, which the backend builds over @facile/tronc. */
export interface McpPending {
  open(userId: string): Promise<PendingAction[]>;
  confirm(userId: string, id: string): Promise<void>;
  dismiss(userId: string, id: string): Promise<void>;
}

const actionInput = z.object({ id: z.string().min(1).max(64) });

const meta = { forfait: { ids: 'unscoped' as const } };

function pendingOf(ctx: Context): McpPending {
  if (!ctx.mcp) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'MCP is not configured on this server' });
  return ctx.mcp;
}

/**
 * The confirm page of MCP actions. Only the person's own browser session
 * gets through, never a delegated or bearer token, so an agent never confirms
 * its own request. No plan is needed: MCP is free.
 */
export const mcpRouter = router({
  pending: sessionProcedure.query(({ ctx }) => (ctx.mcp ? ctx.mcp.open(ctx.user.id) : [])),

  confirm: sessionProcedure
    .meta(meta)
    .input(actionInput)
    .mutation(async ({ ctx, input }) => {
      await pendingOf(ctx).confirm(ctx.user.id, input.id);
      return { id: input.id, confirmed: true };
    }),

  dismiss: sessionProcedure
    .meta(meta)
    .input(actionInput)
    .mutation(async ({ ctx, input }) => {
      await pendingOf(ctx).dismiss(ctx.user.id, input.id);
      return { id: input.id, dismissed: true };
    }),
});
