import { TRPCError } from '@trpc/server';
import { prisma } from '@repo/database/prisma';
import type { ServerEnv } from '@repo/env';

/**
 * Registre owns shared spaces: once a team is linked to a Registre space, its
 * name, members, roles, leaving and deletion are managed there, and Glouton
 * only mirrors them. Description, SMTP, API keys and webhooks stay local.
 */

/** Registre's spaces page, or null when SSO is not configured. */
export function registreSpacesUrl(env: ServerEnv): string | null {
  return env.OIDC_ISSUER ? `${env.OIDC_ISSUER.replace(/\/$/, '')}/spaces` : null;
}

/** Where to manage one linked team, or null for an unlinked one. */
export function manageUrl(env: ServerEnv, registreSpaceId: string | null): string | null {
  const spaces = registreSpacesUrl(env);
  if (!spaces) return null;
  return registreSpaceId ? `${spaces}/${registreSpaceId}` : spaces;
}

/** Refuses with 409 because the action belongs to Registre. */
function managedInRegistre(url: string | null): never {
  throw new TRPCError({
    code: 'CONFLICT',
    message: url
      ? `Cet espace est géré dans Registre : ${url}`
      : 'Cet espace est géré dans Registre.',
  });
}

/** Refuses creating a team while Registre owns spaces. */
export function refuseCreateWhenManaged(env: ServerEnv): void {
  const spaces = registreSpacesUrl(env);
  if (spaces) managedInRegistre(spaces);
}

/**
 * Refuses a membership, leave, delete or rename action on a team linked to
 * Registre. `rename` is the requested name, refused only when it differs.
 */
export async function refuseWhenLinked(env: ServerEnv, teamId: string, rename?: string): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { name: true, registreSpaceId: true },
  });
  if (!team?.registreSpaceId) return;
  if (rename !== undefined && rename === team.name) return;
  managedInRegistre(manageUrl(env, team.registreSpaceId));
}
