import { z } from 'zod';
import { router, humanProcedure } from '../../trpc';
import type { Context } from '../../context';
import { resolveScope } from '../../utils/scope';
import { accessForScope, accessForUser } from '../contact/access';
import { ASSISTANT_ACTIONS } from './prompt';
import { assistantStatus, nextAction, write } from './service';

type AuthedContext = Context & { user: NonNullable<Context['user']> };

const teamId = z.string().uuid().optional();
const contactId = z.string().min(1).optional();

export const assistantWriteSchema = z.object({
  teamId,
  personId: contactId,
  companyId: contactId,
  action: z.enum(ASSISTANT_ACTIONS),
  instruction: z.string().max(2000).optional(),
  subject: z.string().max(500).optional(),
  body: z.string().max(20000).optional(),
  language: z.enum(['fr', 'en']).optional(),
});

export const assistantNextActionSchema = z
  .object({ teamId, personId: contactId, companyId: contactId })
  .refine((v) => Boolean(v.personId) !== Boolean(v.companyId), 'Give exactly one of personId or companyId');

async function access(ctx: AuthedContext, team: string | undefined) {
  if (!team) return accessForUser(ctx.prisma, ctx.user.id, ctx.actor);
  return accessForScope(await resolveScope(ctx.prisma, ctx.user.id, team, ctx.planMode), ctx.actor);
}

function sender(ctx: AuthedContext) {
  return { firstName: ctx.user.firstName ?? null, lastName: ctx.user.lastName ?? null };
}

export const assistantRouter = router({
  status: humanProcedure
    .input(z.object({ teamId }).optional())
    .query(async ({ ctx, input }) => {
      if (input?.teamId) await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
      return assistantStatus(ctx.bulle, ctx.user.id);
    }),

  write: humanProcedure.input(assistantWriteSchema).mutation(async ({ ctx, input }) =>
    write(ctx.prisma, ctx.bulle, await access(ctx, input.teamId), sender(ctx), {
      action: input.action,
      instruction: input.instruction,
      subject: input.subject,
      body: input.body,
      language: input.language ?? 'fr',
      personId: input.personId,
      companyId: input.companyId,
    })
  ),

  nextAction: humanProcedure.input(assistantNextActionSchema).mutation(async ({ ctx, input }) =>
    nextAction(ctx.prisma, ctx.bulle, await access(ctx, input.teamId), sender(ctx), {
      personId: input.personId,
      companyId: input.companyId,
    })
  ),
});
