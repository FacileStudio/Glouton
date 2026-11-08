import { router } from './trpc';
import { userRouter } from './modules/user/router';
import { authRouter } from './modules/auth/router';
import { leadRouter } from './modules/lead/router';
import { emailRouter } from './modules/email/router';
import { teamRouter } from './modules/team/router';
import { opportunityRouter } from './modules/opportunity/router';
import { companyCreationRouter } from './modules/company-creation/router';
import { contactRouter } from './modules/contact/router';
import { inboxRouter } from './modules/inbox/router';
import { ardoiseRouter } from './modules/ardoise/router';
import { assistantRouter } from './modules/assistant/router';
import { forfaitRouter } from './modules/forfait/router';
import { competitorRouter } from './modules/competitor/router';
import { competitorWatchRouter } from './modules/competitor-watch/router';
import { createOpenApiDocument } from './openapi';
import { bindProcedures } from './modules/forfait/procedures';
import { isIdKey } from './modules/forfait/gate';

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  lead: leadRouter,
  email: emailRouter,
  team: teamRouter,
  opportunity: opportunityRouter,
  companyCreation: companyCreationRouter,
  contact: contactRouter,
  inbox: inboxRouter,
  ardoise: ardoiseRouter,
  assistant: assistantRouter,
  forfait: forfaitRouter,
  competitor: competitorRouter,
  competitorWatch: competitorWatchRouter,
});

bindProcedures(appRouter._def.procedures, isIdKey);

export const openApiDocument = createOpenApiDocument(appRouter);

export type AppRouter = typeof appRouter;

export { createContext, type Context, type CreateContextOptions } from './context';
export { router, publicProcedure, protectedProcedure, humanProcedure, adminProcedure } from './trpc';
export * from './delegation';
export { globalCacheFactory } from './cache';
export * as contactService from './modules/contact/service';
export * as contactSchemas from './modules/contact/schemas';
export * as inboxService from './modules/inbox/service';
export * as ardoise from './modules/ardoise';
export { accessForUser, targetTeam, type Access } from './modules/contact/access';
export {
  draftCreateSchema,
  draftUpdateSchema,
  suggestionCreateSchema,
  suggestionStatusSchema,
  suggestionInput,
} from './modules/inbox/router';
export * as forfait from './modules/forfait';
export * as competitorRules from './modules/competitor/rules';
export * as mailTransport from './modules/email/transport';
export { BulleClient, bulleFromEnv } from './modules/assistant/bulle';
