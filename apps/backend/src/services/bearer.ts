import { prisma } from '@repo/database';
import type { AuthManager } from '@repo/auth';
import { logger } from '@repo/logger';
import { IdentityError, persistOidcUser, registreIssuer, type OidcClaims } from './oidc';

/**
 * The Glouton user a verified Registre access token acts for. A known
 * identity resolves untouched; a person Glouton has never seen gets their
 * account through the sign-in write path, with the same verified-email and
 * linking rules. undefined refuses the token: no email, an email Registre did
 * not verify, a linking conflict, or a banned account.
 */
export async function bearerUser(auth: AuthManager, claims: OidcClaims): Promise<string | undefined> {
  const issuer = registreIssuer();
  let userId: string | undefined;
  if (issuer && claims.subject) {
    const account = await prisma.account.findUnique({
      where: { providerId_accountId: { providerId: issuer, accountId: claims.subject } },
      select: { userId: true },
    });
    userId = account?.userId;
  }
  if (!userId) {
    if (!claims.email) return undefined;
    try {
      userId = (await persistOidcUser(auth, claims)).id;
    } catch (error) {
      if (error instanceof IdentityError) return undefined;
      throw error;
    }
    logger.info({ userId }, '[OIDC] Account resolved from a bearer token');
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isBanned: true } });
  return user && !user.isBanned ? userId : undefined;
}

/** Reads the profile claims of a verified Registre access token. */
export function bearerClaims(payload: Record<string, unknown>): OidcClaims {
  const text = (key: string) => (typeof payload[key] === 'string' && payload[key] !== '' ? (payload[key] as string) : undefined);
  return {
    email: text('email') ?? '',
    emailVerified: payload.email_verified === true,
    subject: text('sub'),
    locale: text('locale'),
    name: text('name'),
    preferredUsername: text('preferred_username'),
    givenName: text('given_name'),
    familyName: text('family_name'),
    picture: text('picture'),
  };
}
