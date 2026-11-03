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
import { createOpenApiDocument } from './openapi';

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
});

export const openApiDocument = createOpenApiDocument(appRouter);

export type AppRouter = typeof appRouter;

export { createContext, type Context, type CreateContextOptions } from './context';
export { publicProcedure, protectedProcedure, humanProcedure, adminProcedure } from './trpc';
export * from './delegation';
export { globalCacheFactory } from './cache';
export * as contactService from './modules/contact/service';
export * as contactSchemas from './modules/contact/schemas';
export * as inboxService from './modules/inbox/service';
export * as ardoise from './modules/ardoise';
export { accessForUser, type Access } from './modules/contact/access';
export {
  draftCreateSchema,
  draftUpdateSchema,
  suggestionCreateSchema,
  suggestionStatusSchema,
  suggestionInput,
} from './modules/inbox/router';
export * as mailTransport from './modules/email/transport';
