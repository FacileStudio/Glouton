import { z } from 'zod';
import { router, protectedProcedure, humanProcedure } from '../../trpc';
import type { Context } from '../../context';
import { accessForUser } from '../contact/access';
import { ardoiseConfigFromEnv, DEFAULT_ARDOISE_WEB_URL } from './client';
import { ardoiseDeps, turnIntoClient, unlinkCompany } from './sync';

type AuthedContext = Context & { user: NonNullable<Context['user']> };

const optionalField = (max: number) => z.string().trim().max(max).nullish();

export const turnIntoClientSchema = z.object({
  companyId: z.string().min(1),
  billingPersonId: z.string().min(1),
  fill: z
    .object({
      firstName: optionalField(120),
      lastName: optionalField(120),
      email: z.string().trim().email().max(320).nullish().or(z.literal('')),
      siret: optionalField(20),
      vatNumber: optionalField(30),
      addressLine: optionalField(300),
      postalCode: optionalField(20),
      city: optionalField(120),
      country: optionalField(80),
    })
    .optional(),
});

/** The Ardoise sync dependencies for one tRPC call. */
export function ardoiseFor(ctx: Pick<Context, 'prisma' | 'env' | 'jobs' | 'log'>) {
  return ardoiseDeps(ctx.prisma, ctx.env, ctx.jobs, ctx.log);
}

function access(ctx: AuthedContext) {
  return accessForUser(ctx.prisma, ctx.user.id, ctx.actor);
}

export const ardoiseRouter = router({
  status: protectedProcedure.query(({ ctx }) => {
    const config = ardoiseConfigFromEnv(ctx.env);
    return { enabled: Boolean(config), webUrl: config?.webUrl ?? ctx.env.ARDOISE_WEB_URL ?? DEFAULT_ARDOISE_WEB_URL };
  }),

  turnIntoClient: humanProcedure.input(turnIntoClientSchema).mutation(async ({ ctx, input }) =>
    turnIntoClient(
      ardoiseFor(ctx),
      await access(ctx),
      {
        companyId: input.companyId,
        billingPersonId: input.billingPersonId,
        fill: input.fill
          ? {
              firstName: input.fill.firstName,
              lastName: input.fill.lastName,
              email: input.fill.email,
              siret: input.fill.siret,
              vatNumber: input.fill.vatNumber,
              addressLine: input.fill.addressLine,
              postalCode: input.fill.postalCode,
              city: input.fill.city,
              country: input.fill.country,
            }
          : undefined,
      },
      ctx.user.email
    )
  ),

  unlink: humanProcedure
    .input(z.object({ companyId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => unlinkCompany(ardoiseFor(ctx), await access(ctx), input.companyId)),
});
