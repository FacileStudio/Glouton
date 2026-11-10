import { router, protectedProcedure, humanProcedure } from '../../trpc';
import { resolveScope } from '../../utils/scope';
import * as ai from './ai';
import * as applications from './applications';
import * as cv from './cv';
import * as offers from './offers';
import * as schemas from './schemas';
import * as search from './search';

const scoped = { ids: 'scoped' } as const;
const free = { free: true } as const;
const freeScoped = { free: true, ids: 'scoped' } as const;

export const jobRouter = router({
  searches: protectedProcedure.meta({ forfait: free }).input(schemas.scopeSchema).query(async ({ ctx, input }) => {
    return search.listSearches(ctx.prisma, await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode));
  }),

  createSearch: protectedProcedure.input(schemas.createSearchSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    const created = await search.createSearch(ctx.prisma, scope, input.search);
    if (input.runNow) await search.requestRun(ctx.prisma, ctx.jobs, scope, created.id);
    return created;
  }),

  updateSearch: protectedProcedure.meta({ forfait: scoped }).input(schemas.updateSearchSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return search.updateSearch(ctx.prisma, scope, input.searchId, input.search);
  }),

  deleteSearch: protectedProcedure.meta({ forfait: freeScoped }).input(schemas.searchIdSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return search.deleteSearch(ctx.prisma, scope, input.searchId);
  }),

  runSearch: protectedProcedure.meta({ forfait: scoped }).input(schemas.searchIdSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return search.requestRun(ctx.prisma, ctx.jobs, scope, input.searchId);
  }),

  offers: protectedProcedure.meta({ forfait: freeScoped }).input(schemas.listOffersSchema).query(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return offers.listOffers(ctx.prisma, scope, { status: input.status, searchId: input.searchId });
  }),

  offerCounts: protectedProcedure.meta({ forfait: free }).input(schemas.scopeSchema).query(async ({ ctx, input }) => {
    return offers.offerCounts(ctx.prisma, await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode));
  }),

  markOffersSeen: protectedProcedure.input(schemas.scopeSchema).mutation(async ({ ctx, input }) => {
    return offers.markOffersSeen(ctx.prisma, await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode));
  }),

  saveOffer: protectedProcedure.meta({ forfait: scoped }).input(schemas.offerIdSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return offers.saveOffer(ctx.prisma, scope, input.offerId);
  }),

  dismissOffer: protectedProcedure.meta({ forfait: scoped }).input(schemas.offerIdSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return offers.dismissOffer(ctx.prisma, scope, input.offerId);
  }),

  restoreOffer: protectedProcedure.meta({ forfait: scoped }).input(schemas.offerIdSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return offers.restoreOffer(ctx.prisma, scope, input.offerId);
  }),

  applications: protectedProcedure.meta({ forfait: free }).input(schemas.listApplicationsSchema).query(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return applications.listApplications(ctx.prisma, scope, input.status);
  }),

  applicationCounts: protectedProcedure.meta({ forfait: free }).input(schemas.scopeSchema).query(async ({ ctx, input }) => {
    return applications.applicationCounts(ctx.prisma, await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode));
  }),

  application: protectedProcedure.meta({ forfait: freeScoped }).input(schemas.applicationIdSchema).query(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return applications.presentApplication(await applications.loadApplication(ctx.prisma, scope, input.applicationId));
  }),

  createApplication: protectedProcedure.input(schemas.createApplicationSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return applications.createApplication(ctx.prisma, scope, input.application);
  }),

  updateApplication: protectedProcedure.meta({ forfait: scoped }).input(schemas.updateApplicationSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return applications.updateApplication(ctx.prisma, scope, input.applicationId, input.application);
  }),

  moveApplication: protectedProcedure.meta({ forfait: scoped }).input(schemas.moveApplicationSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return applications.moveApplication(ctx.prisma, scope, input.applicationId, input.status);
  }),

  deleteApplication: protectedProcedure.meta({ forfait: freeScoped }).input(schemas.applicationIdSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return applications.deleteApplication(ctx.prisma, scope, input.applicationId);
  }),

  cvs: humanProcedure.meta({ forfait: free }).input(schemas.scopeSchema).query(async ({ ctx, input }) => {
    return cv.listCvs(ctx.prisma, ctx.user.id, await resolveScope(ctx.prisma, ctx.user.id, input?.teamId, ctx.planMode));
  }),

  cv: humanProcedure.meta({ forfait: freeScoped }).input(schemas.cvIdSchema).query(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return cv.getCv(ctx.prisma, ctx.user.id, scope, input.cvId);
  }),

  downloadCv: humanProcedure.meta({ forfait: freeScoped }).input(schemas.cvIdSchema).query(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return cv.downloadCv(ctx.prisma, ctx.user.id, scope, input.cvId);
  }),

  createCv: humanProcedure.input(schemas.createCvSchema).mutation(async ({ ctx, input }) => {
    const { teamId, ...fields } = input;
    const scope = await resolveScope(ctx.prisma, ctx.user.id, teamId, ctx.planMode);
    return cv.createCv(ctx.prisma, ctx.user.id, scope, fields);
  }),

  updateCv: humanProcedure.meta({ forfait: scoped }).input(schemas.updateCvSchema).mutation(async ({ ctx, input }) => {
    const { teamId, cvId, ...fields } = input;
    const scope = await resolveScope(ctx.prisma, ctx.user.id, teamId, ctx.planMode);
    return cv.updateCv(ctx.prisma, ctx.user.id, scope, cvId, fields);
  }),

  deleteCv: humanProcedure.meta({ forfait: freeScoped }).input(schemas.cvIdSchema).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return cv.deleteCv(ctx.prisma, ctx.user.id, scope, input.cvId);
  }),

  drafts: humanProcedure.meta({ forfait: freeScoped }).input(schemas.applicationIdSchema).query(async ({ ctx, input }) => {
    const scope = await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return ai.listDrafts(ctx.prisma, scope, input.applicationId);
  }),

  draft: humanProcedure.meta({ forfait: scoped }).input(schemas.draftSchema).mutation(async ({ ctx, input }) => {
    const { teamId, ...rest } = input;
    const scope = await resolveScope(ctx.prisma, ctx.user.id, teamId, ctx.planMode);
    return ai.draftForApplication({ prisma: ctx.prisma, bulle: ctx.bulle ?? null, forfait: ctx.forfait }, scope, rest);
  }),

  updateDraft: humanProcedure.meta({ forfait: scoped }).input(schemas.updateDraftSchema).mutation(async ({ ctx, input }) => {
    await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return ai.updateDraft(ctx.prisma, ctx.user.id, input.draftId, input.content);
  }),

  deleteDraft: humanProcedure.meta({ forfait: freeScoped }).input(schemas.draftIdSchema).mutation(async ({ ctx, input }) => {
    await resolveScope(ctx.prisma, ctx.user.id, input.teamId, ctx.planMode);
    return ai.deleteDraft(ctx.prisma, ctx.user.id, input.draftId);
  }),
});
