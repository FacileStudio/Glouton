import { initTRPC, TRPCError } from '@trpc/server';
import { type Context } from './context';
import { hasAccess } from '@repo/auth-shared';
import { UserRole } from '@repo/types';
import { type OpenApiMeta } from 'trpc-to-openapi';
import { READ_SCOPE, WRITE_SCOPE, hasScope } from './delegation';
import { authorize, upgradeUrlOf, type ForfaitMeta } from './modules/forfait/gate';
import { idKeysOf, isReadable, parsedInput } from './modules/forfait/procedures';
import { rowLoader } from './modules/forfait/store';

const t = initTRPC.context<Context>().meta<OpenApiMeta & ForfaitMeta>().create({
  

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
 * the forfait EXEMPT and ACCOUNT lists run without `glouton.access` in the
 * call's scope. The scope comes from the input as the procedure parses it,
 * or from the row a by-id procedure declares in its meta.
 */
const requiresPlan = t.middleware(async ({ next, ctx, path, meta, getRawInput }) => {
  const planMode = await authorize(ctx.forfait, {
    path,
    userId: ctx.user?.id ?? null,
    input: await parsedInput(path, await getRawInput()),
    idKeys: idKeysOf(path),
    readable: isReadable(path),
    meta,
    loadRow: rowLoader(ctx.prisma),
  });
  return next({ ctx: { planMode } });
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

const authedProcedure = t.procedure.use(loggingMiddleware).use(isAuthed);

export const protectedProcedure = authedProcedure.use(requiresPlan);
export const humanProcedure = authedProcedure.use(isHuman).use(requiresPlan);
export const adminProcedure = authedProcedure.use(isHuman).use(isAdmin).use(requiresPlan);
