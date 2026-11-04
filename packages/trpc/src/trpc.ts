import { initTRPC, TRPCError } from '@trpc/server';
import { type Context } from './context';
import { hasAccess } from '@repo/auth-shared';
import { UserRole } from '@repo/types';
import { type OpenApiMeta } from 'trpc-to-openapi';
import { READ_SCOPE, WRITE_SCOPE, hasScope } from './delegation';
import { authorize, upgradeUrlOf } from './modules/forfait/gate';

const t = initTRPC.context<Context>().meta<OpenApiMeta>().create({
  

  errorFormatter({ shape, error, ctx, path }) {
    

    if (ctx?.log && error.code === 'INTERNAL_SERVER_ERROR') {
      ctx.log.error({
        error: {
          message: error.message,
          code: error.code,
          stack: error.stack,
          cause: error.cause,
        },
        path,
      });
    }

    const isProduction = process.env.NODE_ENV === 'production';

    return {
      ...shape,
      data: {
        ...shape.data,
        stack: isProduction ? undefined : shape.data.stack,
        upgrade_url: upgradeUrlOf(error),
      },
    };
  },
});

export const router = t.router;

const loggingMiddleware = t.middleware(async ({ path, type, next, ctx }) => {
  const start = Date.now();

  const result = await next();

  const duration = Date.now() - start;

  ctx.log.debug({
    type: 'trpc-call',
    path,
    callType: type,
    duration: `${duration}ms`,
    success: result.ok,
  });

  return result;
});

/**
 * The subscription gate, on every procedure: default-deny, so only paths in
 * the forfait EXEMPT list run without `glouton.access` in the call's scope.
 */
const requiresPlan = t.middleware(async ({ next, ctx, path, getRawInput }) => {
  await authorize(ctx.forfait, { path, userId: ctx.user?.id ?? null, rawInput: await getRawInput() });
  return next();
});

export const publicProcedure = t.procedure.use(loggingMiddleware).use(requiresPlan);

const isAuthed = t.middleware(({ next, ctx, type }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please log in.' });
  }
  if (!hasScope(ctx.scopes, type === 'query' ? READ_SCOPE : WRITE_SCOPE)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'This token lacks the required scope.' });
  }
  return next({
    ctx: { ...ctx, user: ctx.user },
  });
});

const isAdmin = t.middleware(({ next, ctx }) => {
  

  if (!hasAccess(ctx.user, UserRole.ADMIN)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access restricted to administrators.',
    });
  }
  return next();
});

/** Rejects any delegated (agent) caller: only a person signed in to Glouton gets through. */
const isHuman = t.middleware(({ next, ctx }) => {
  if (ctx.actor) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'This action needs a person signed in to Glouton.',
    });
  }
  return next();
});

export const protectedProcedure = t.procedure.use(loggingMiddleware).use(isAuthed).use(requiresPlan);
export const humanProcedure = protectedProcedure.use(isHuman);
export const adminProcedure = humanProcedure.use(isAdmin);
