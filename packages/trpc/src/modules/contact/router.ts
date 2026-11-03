import { z } from 'zod';
import { router, protectedProcedure, humanProcedure } from '../../trpc';
import type { Context } from '../../context';
import { resolveScope } from '../../utils/scope';
import { accessForScope, accessForUser } from './access';
import * as contacts from './service';
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

const scoped = z.object({ teamId: z.string().uuid().optional() });
const target = z
  .object({ companyId: z.string().optional(), personId: z.string().optional() })
  .refine((v) => Boolean(v.companyId || v.personId), 'Give a company or a person');

async function scopeAccess(ctx: AuthedContext, teamId: string | undefined) {
  const scope = await resolveScope(ctx.prisma, ctx.user.id, teamId);
  return accessForScope(scope, ctx.actor);
}

function userAccess(ctx: AuthedContext) {
  return accessForUser(ctx.prisma, ctx.user.id, ctx.actor);
}

function originOf(ctx: AuthedContext) {
  return ctx.actor ? 'AGENT' : 'MANUAL';
}

export const contactRouter = router({
  listCompanies: protectedProcedure
    .input(listFiltersSchema.merge(scoped))
    .query(async ({ ctx, input }) =>
      contacts.listCompanies(ctx.prisma, await scopeAccess(ctx, input.teamId), input)
    ),

  listPeople: protectedProcedure
    .input(listFiltersSchema.merge(scoped))
    .query(async ({ ctx, input }) =>
      contacts.listPeople(ctx.prisma, await scopeAccess(ctx, input.teamId), input)
    ),

  search: protectedProcedure
    .input(listFiltersSchema.merge(scoped))
    .query(async ({ ctx, input }) =>
      contacts.searchContacts(ctx.prisma, await scopeAccess(ctx, input.teamId), input)
    ),

  getCompany: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => contacts.getCompany(ctx.prisma, await userAccess(ctx), input.id)),

  getPerson: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => contacts.getPerson(ctx.prisma, await userAccess(ctx), input.id)),

  createCompany: protectedProcedure
    .input(companyCreateSchema)
    .mutation(async ({ ctx, input }) =>
      contacts.createCompany(ctx.prisma, await userAccess(ctx), input, originOf(ctx))
    ),

  updateCompany: protectedProcedure
    .input(z.object({ id: z.string(), data: companyUpdateSchema }))
    .mutation(async ({ ctx, input }) =>
      contacts.updateCompany(ctx.prisma, await userAccess(ctx), input.id, input.data)
    ),

  createPerson: protectedProcedure
    .input(personCreateSchema)
    .mutation(async ({ ctx, input }) =>
      contacts.createPerson(ctx.prisma, await userAccess(ctx), input, originOf(ctx))
    ),

  updatePerson: protectedProcedure
    .input(z.object({ id: z.string(), data: personUpdateSchema }))
    .mutation(async ({ ctx, input }) =>
      contacts.updatePerson(ctx.prisma, await userAccess(ctx), input.id, input.data)
    ),

  changeStage: protectedProcedure
    .input(z.object({ companyId: z.string().optional(), personId: z.string().optional(), stage: contactStageSchema }))
    .mutation(async ({ ctx, input }) =>
      contacts.changeStage(ctx.prisma, await userAccess(ctx), input, input.stage)
    ),

  addNote: protectedProcedure
    .input(target.and(z.object({ text: z.string().trim().min(1).max(5000) })))
    .mutation(async ({ ctx, input }) =>
      contacts.addNote(ctx.prisma, await userAccess(ctx), input, input.text)
    ),

  checkDuplicates: protectedProcedure
    .input(duplicateCheckSchema)
    .query(async ({ ctx, input }) => contacts.findDuplicates(ctx.prisma, await userAccess(ctx), input)),

  outreach: protectedProcedure
    .input(target)
    .query(async ({ ctx, input }) => contacts.listOutreach(ctx.prisma, await userAccess(ctx), input)),

  mergeCompanies: humanProcedure
    .input(z.object({ targetId: z.string(), sourceId: z.string() }))
    .mutation(async ({ ctx, input }) =>
      contacts.mergeCompanies(ctx.prisma, await userAccess(ctx), input.targetId, input.sourceId)
    ),

  mergePeople: humanProcedure
    .input(z.object({ targetId: z.string(), sourceId: z.string() }))
    .mutation(async ({ ctx, input }) =>
      contacts.mergePeople(ctx.prisma, await userAccess(ctx), input.targetId, input.sourceId)
    ),

  deleteCompany: humanProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => contacts.deleteCompany(ctx.prisma, await userAccess(ctx), input.id)),

  deletePerson: humanProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => contacts.deletePerson(ctx.prisma, await userAccess(ctx), input.id)),
});
