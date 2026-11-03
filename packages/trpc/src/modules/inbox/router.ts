import { z } from 'zod';
import { router, protectedProcedure, humanProcedure } from '../../trpc';
import type { Context } from '../../context';
import { accessForUser } from '../contact/access';
import * as inbox from './service';
import { withStringPayload } from '../../utils/json';
import { ardoiseFor } from '../ardoise/router';

type AuthedContext = Context & { user: NonNullable<Context['user']> };

export const suggestionKindSchema = z.enum(['DRAFT', 'FOLLOW_UP', 'RESCORE', 'NEXT_ACTION', 'MATCH', 'IMPORT']);
export const suggestionStatusSchema = z.enum(['OPEN', 'ACCEPTED', 'DISMISSED']);

export const draftCreateSchema = z.object({
  personId: z.string(),
  subject: z.string().trim().min(1).max(300),
  html: z.string().max(100_000).nullish(),
  text: z.string().min(1).max(50_000),
  rationale: z.string().max(5000).nullish(),
});

export const draftUpdateSchema = z.object({
  subject: z.string().trim().min(1).max(300).optional(),
  html: z.string().max(100_000).nullish(),
  text: z.string().min(1).max(50_000).optional(),
  rationale: z.string().max(5000).nullish(),
});

export const suggestionCreateSchema = z.object({
  kind: suggestionKindSchema,
  title: z.string().trim().min(1).max(300),
  body: z.string().max(10_000).nullish(),
  rationale: z.string().max(5000).nullish(),
  companyId: z.string().nullish(),
  personId: z.string().nullish(),
  teamId: z.string().uuid().nullish(),
  payload: z.record(z.unknown()).optional(),
});

/** Spells the fields out so the input type holds under the frontend's looser compiler settings. */
export function suggestionInput(input: z.infer<typeof suggestionCreateSchema>): inbox.SuggestionInput {
  return {
    kind: input.kind,
    title: input.title,
    body: input.body,
    rationale: input.rationale,
    companyId: input.companyId,
    personId: input.personId,
    teamId: input.teamId,
    payload: input.payload as inbox.SuggestionInput['payload'],
  };
}

function access(ctx: AuthedContext) {
  return accessForUser(ctx.prisma, ctx.user.id, ctx.actor);
}

export function notifier(ctx: Pick<Context, 'events'>): inbox.Notify | undefined {
  const events = ctx.events;
  if (!events) return undefined;
  return (scope, type, data) => events.emitToScope(scope, type, data);
}

export const inboxRouter = router({
  counts: protectedProcedure.query(async ({ ctx }) => inbox.inboxCounts(ctx.prisma, await access(ctx))),

  drafts: protectedProcedure.query(async ({ ctx }) => inbox.listDrafts(ctx.prisma, await access(ctx))),

  suggestions: protectedProcedure
    .input(z.object({ status: suggestionStatusSchema.default('OPEN') }).optional())
    .query(async ({ ctx, input }) =>
      (await inbox.listSuggestions(ctx.prisma, await access(ctx), input?.status)).map(withStringPayload)
    ),

  createDraft: protectedProcedure
    .input(draftCreateSchema)
    .mutation(async ({ ctx, input }) =>
      inbox.createDraft(
        ctx.prisma,
        await access(ctx),
        { personId: input.personId, subject: input.subject, html: input.html, text: input.text, rationale: input.rationale },
        notifier(ctx)
      )
    ),

  updateDraft: protectedProcedure
    .input(z.object({ id: z.string(), data: draftUpdateSchema }))
    .mutation(async ({ ctx, input }) => inbox.updateDraft(ctx.prisma, await access(ctx), input.id, input.data)),

  discardDraft: humanProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => inbox.discardDraft(ctx.prisma, await access(ctx), input.id)),

  createSuggestion: protectedProcedure
    .input(suggestionCreateSchema)
    .mutation(async ({ ctx, input }) =>
      inbox.createSuggestion(
        ctx.prisma,
        await access(ctx),
        suggestionInput(input),
        notifier(ctx)
      )
    ),

  decideSuggestion: humanProcedure
    .input(z.object({ id: z.string(), decision: z.enum(['ACCEPT', 'DISMISS']) }))
    .mutation(async ({ ctx, input }) =>
      inbox.decideSuggestion(ctx.prisma, await access(ctx), input.id, input.decision, ardoiseFor(ctx).hooks)
    ),
});
