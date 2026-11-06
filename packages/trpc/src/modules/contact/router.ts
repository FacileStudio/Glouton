import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { router, protectedProcedure, humanProcedure } from '../../trpc';
import type { Context } from '../../context';
import { resolveScope } from '../../utils/scope';
import { accessForScope, accessForUser } from './access';
import { ardoiseFor } from '../ardoise/router';
import * as contacts from './service';
import { withStringPayload } from '../../utils/json';
import {
  companyCreateSchema,
  companyUpdateSchema,
  contactStageSchema,
  duplicateCheckSchema,
  listFiltersSchema,
  personCreateSchema,
  personUpdateSchema,
} from './schemas';

type AuthedContext = Context & { user: NonNullable<Context['user']> };

type PayloadRow = { payload: Prisma.JsonValue };

/**
 * Narrows the activity and suggestion payloads of a contact detail for the web client.
 */
function withStringPayloads<T extends { activities: PayloadRow[]; suggestions: PayloadRow[] }>(detail: T) {
  return {
    ...detail,
    activities: detail.activities.map(withStringPayload),
    suggestions: detail.suggestions.map(withStringPayload),
  };
}

const scoped = z.object({ teamId: z.string().uuid().optional() });
const targetShape = z.object({ companyId: z.string().optional(), personId: z.string().optional() });
const hasTarget = (v: { companyId?: string; personId?: string }) => Boolean(v.companyId || v.personId);
const target = targetShape.refine(hasTarget, 'Give a company or a person');
const noteInput = targetShape
  .extend({ text: z.string().trim().min(1).max(5000) })
  .refine(hasTarget, 'Give a company or a person');

async function scopeAccess(ctx: AuthedContext, teamId: string | undefined) {
  const scope = await resolveScope(ctx.prisma, ctx.user.id, teamId, ctx.planMode);
  return accessForScope(scope, ctx.actor);
}

function userAccess(ctx: AuthedContext) {
  return accessForUser(ctx.prisma, ctx.user.id, ctx.actor, ctx.planMode);
}

function hooks(ctx: AuthedContext) {
  return ardoiseFor(ctx).hooks;
}

function originOf(ctx: AuthedContext) {
  return ctx.actor ? 'AGENT' : 'MANUAL';
}

export const contactRouter = router({
  listCompanies: protectedProcedure.meta({ forfait: { free: true } })
    .input(listFiltersSchema.merge(scoped))
    .query(async ({ ctx, input }) =>
      contacts.listCompanies(ctx.prisma, await scopeAccess(ctx, input.teamId), input)
    ),

  listPeople: protectedProcedure.meta({ forfait: { free: true } })
    .input(listFiltersSchema.merge(scoped))
    .query(async ({ ctx, input }) =>
      contacts.listPeople(ctx.prisma, await scopeAccess(ctx, input.teamId), input)
    ),

  search: protectedProcedure.meta({ forfait: { free: true } })
    .input(listFiltersSchema.merge(scoped))
    .query(async ({ ctx, input }) =>
      contacts.searchContacts(ctx.prisma, await scopeAccess(ctx, input.teamId), input)
    ),

  getCompany: protectedProcedure.meta({ forfait: { free: true } })
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const { websiteAudit: _audit, socialProfiles: _profiles, ...company } = await contacts.getCompany(
        ctx.prisma,
        await userAccess(ctx),
        input.id
      );
      return withStringPayloads(company);
    }),

  getPerson: protectedProcedure.meta({ forfait: { free: true } })
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) =>
      withStringPayloads(await contacts.getPerson(ctx.prisma, await userAccess(ctx), input.id))
    ),

  createCompany: protectedProcedure
    .input(companyCreateSchema)
    .mutation(async ({ ctx, input }) =>
      contacts.createCompany(ctx.prisma, await userAccess(ctx), input, originOf(ctx))
    ),

  updateCompany: protectedProcedure
    .input(z.object({ id: z.string(), data: companyUpdateSchema }))
    .mutation(async ({ ctx, input }) =>
      contacts.updateCompany(ctx.prisma, await userAccess(ctx), input.id, input.data, hooks(ctx))
    ),

  createPerson: protectedProcedure
    .input(personCreateSchema)
    .mutation(async ({ ctx, input }) =>
      contacts.createPerson(ctx.prisma, await userAccess(ctx), input, originOf(ctx))
    ),

  updatePerson: protectedProcedure
    .input(z.object({ id: z.string(), data: personUpdateSchema }))
    .mutation(async ({ ctx, input }) =>
      contacts.updatePerson(ctx.prisma, await userAccess(ctx), input.id, input.data, hooks(ctx))
    ),

  changeStage: protectedProcedure
    .input(z.object({ companyId: z.string().optional(), personId: z.string().optional(), stage: contactStageSchema }))
    .mutation(async ({ ctx, input }) =>
      contacts.changeStage(ctx.prisma, await userAccess(ctx), input, input.stage)
    ),

  addNote: protectedProcedure
    .input(noteInput)
    .mutation(async ({ ctx, input }) =>
      contacts.addNote(ctx.prisma, await userAccess(ctx), input, input.text)
    ),

  checkDuplicates: protectedProcedure
    .input(duplicateCheckSchema)
    .query(async ({ ctx, input }) => contacts.findDuplicates(ctx.prisma, await userAccess(ctx), input)),

  outreach: protectedProcedure.meta({ forfait: { free: true } })
    .input(target)
    .query(async ({ ctx, input }) => contacts.listOutreach(ctx.prisma, await userAccess(ctx), input)),

  mergeCompanies: humanProcedure
    .input(z.object({ targetId: z.string(), sourceId: z.string() }))
    .mutation(async ({ ctx, input }) =>
      contacts.mergeCompanies(ctx.prisma, await userAccess(ctx), input.targetId, input.sourceId, hooks(ctx))
    ),

  mergePeople: humanProcedure
    .input(z.object({ targetId: z.string(), sourceId: z.string() }))
    .mutation(async ({ ctx, input }) =>
      contacts.mergePeople(ctx.prisma, await userAccess(ctx), input.targetId, input.sourceId)
    ),

  deleteCompany: humanProcedure.meta({ forfait: { free: true } })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => contacts.deleteCompany(ctx.prisma, await userAccess(ctx), input.id, hooks(ctx))),

  deletePerson: humanProcedure.meta({ forfait: { free: true } })
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => contacts.deletePerson(ctx.prisma, await userAccess(ctx), input.id)),
});
