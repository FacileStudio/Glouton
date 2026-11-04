import { createRemoteJWKSet, jwtVerify } from 'jose';
import { prisma } from '@repo/database';
import type { AuthManager, SessionUser } from '@repo/auth';
import { UserRole } from '@repo/types';
import { logger } from '@repo/logger';
import env from '../env';

/**
 * OIDC SSO (authorization code flow), following the same conventions as the
 * other Facile apps (Nuage, Courrier, Agenda):
 *   GET /auth/config        -> { sso_only, oidc_enabled }
 *   GET /auth/oidc          -> redirect to the provider
 *   GET /auth/oidc/callback -> exchange code, upsert user, redirect to the app
 */

export interface OidcClaims {
  email: string;
  subject?: string;
  name?: string;
  preferredUsername?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  refreshToken?: string;
}

interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

export const oidcEnabled = Boolean(env.OIDC_ISSUER);
/** Password sign-in and sign-up are off whenever SSO is configured, not only under SSO_ONLY. */
export const ssoOnly = Boolean(env.SSO_ONLY) || oidcEnabled;

const redirectUrl = env.OIDC_REDIRECT_URL ?? `${env.DOMAIN}/auth/oidc/callback`;
const successUrl = env.OIDC_SUCCESS_URL ?? `${env.DOMAIN}/auth/callback`;

let discoveryCache: DiscoveryDocument | null = null;
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

async function discover(): Promise<DiscoveryDocument> {
  if (discoveryCache) return discoveryCache;
  if (!env.OIDC_ISSUER) throw new Error('OIDC is not configured');

  const url = `${env.OIDC_ISSUER.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OIDC discovery failed: ${response.status} ${response.statusText}`);
  }

  const doc = (await response.json()) as DiscoveryDocument;
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw new Error('OIDC discovery document is missing required endpoints');
  }

  discoveryCache = doc;
  return doc;
}

function jwks(jwksUri: string) {
  jwksCache ??= createRemoteJWKSet(new URL(jwksUri));
  return jwksCache;
}

/** The issuer's signing keys, found through OIDC discovery and cached. */
export async function registreKeys(): Promise<ReturnType<typeof createRemoteJWKSet>> {
  const doc = await discover();
  return jwks(doc.jwks_uri);
}

export function generateState(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
}

export async function buildAuthorizationUrl(state: string): Promise<string> {
  const doc = await discover();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.OIDC_CLIENT_ID!,
    redirect_uri: redirectUrl,
    scope: 'openid email profile offline_access',
    state,
  });
  return `${doc.authorization_endpoint}?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<OidcClaims> {
  const doc = await discover();

  const response = await fetch(doc.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${encodeURIComponent(env.OIDC_CLIENT_ID!)}:${encodeURIComponent(env.OIDC_CLIENT_SECRET!)}`
      ).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUrl,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error({ status: response.status, body }, '[OIDC] Token exchange failed');
    throw new Error('OIDC token exchange failed');
  }

  const tokens = (await response.json()) as { id_token?: string; refresh_token?: string };
  if (!tokens.id_token) {
    throw new Error('OIDC provider did not return an id_token');
  }

  const { payload } = await jwtVerify(tokens.id_token, jwks(doc.jwks_uri), {
    issuer: doc.issuer,
    audience: env.OIDC_CLIENT_ID!,
  });

  const email = typeof payload.email === 'string' ? payload.email : '';
  if (!email) {
    throw new Error('OIDC provider did not return an email');
  }

  const str = (value: unknown): string | undefined =>
    typeof value === 'string' && value !== '' ? value : undefined;

  return {
    email,
    subject: str(payload.sub),
    name: str(payload.name),
    preferredUsername: str(payload.preferred_username),
    givenName: str(payload.given_name),
    familyName: str(payload.family_name),
    picture: str(payload.picture),
    refreshToken: str(tokens.refresh_token),
  };
}

/** Keeps the picture claim only when it is an https URL, so a browser can load it as is. */
export function httpsPicture(picture: string | undefined): string | null {
  return picture?.startsWith('https://') ? picture : null;
}

/** Splits the name claims into Glouton's first and last name columns. */
export function splitName(claims: OidcClaims): { firstName: string; lastName: string } {
  if (claims.givenName || claims.familyName) {
    return { firstName: claims.givenName ?? '', lastName: claims.familyName ?? '' };
  }
  const display = claims.name ?? claims.preferredUsername ?? claims.email.split('@')[0] ?? '';
  const [firstName = '', ...rest] = display.trim().split(/\s+/);
  return { firstName, lastName: rest.join(' ') };
}

/**
 * The issuer a Registre identity is recorded under, as `Account.providerId`,
 * without a trailing slash so login and the directory sync agree.
 */
export function registreIssuer(): string | null {
  return env.OIDC_ISSUER ? env.OIDC_ISSUER.replace(/\/$/, '') : null;
}

/** Raised when an SSO sign-in matches a local account Glouton never verified. */
export class UnverifiedAccountError extends Error {
  constructor() {
    super('An unverified local account already uses this email; an administrator must verify it before SSO can link it');
    this.name = 'UnverifiedAccountError';
  }
}

/**
 * Finds the user for an SSO sign-in: by Registre identity (issuer, sub) first,
 * so a user pre-provisioned by the directory sync lands on their row, then by
 * email. The email fallback links only a local account whose email Glouton
 * marked verified (an earlier SSO sign-in, the directory sync, or an admin);
 * otherwise anyone who registered with a victim's email would inherit the
 * victim's SSO identity. An unverified match is refused, not replaced.
 */
export async function findOidcUser(
  claims: Pick<OidcClaims, 'email' | 'subject'>,
  db: Pick<typeof prisma, 'account' | 'user'> = prisma
): Promise<{ id: string } | null> {
  const issuer = registreIssuer();
  if (issuer && claims.subject) {
    const account = await db.account.findUnique({
      where: { providerId_accountId: { providerId: issuer, accountId: claims.subject } },
      select: { userId: true },
    });
    if (account) return { id: account.userId };
  }
  const local = await db.user.findUnique({ where: { email: claims.email }, select: { id: true, emailVerified: true } });
  if (!local) return null;
  if (!local.emailVerified) throw new UnverifiedAccountError();
  return { id: local.id };
}

/**
 * Records the Registre identity of a signed-in user, and keeps the latest
 * refresh token encrypted so Glouton can later exchange it for app tokens.
 */
async function recordIdentity(auth: AuthManager, userId: string, claims: OidcClaims): Promise<void> {
  const issuer = registreIssuer();
  if (!issuer || !claims.subject) return;
  const refreshToken = claims.refreshToken ? auth.encryptData(claims.refreshToken) : undefined;
  await prisma.account.upsert({
    where: { providerId_accountId: { providerId: issuer, accountId: claims.subject } },
    create: { userId, providerId: issuer, accountId: claims.subject, refreshToken },
    update: refreshToken ? { refreshToken } : {},
  });
}

export async function loginWithOidc(
  auth: AuthManager,
  claims: OidcClaims
): Promise<{ token: string; user: SessionUser }> {
  const { firstName, lastName } = splitName(claims);

  const existing = await findOidcUser(claims);

  let user;
  if (existing) {
    user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        avatarUrl: httpsPicture(claims.picture),
        emailVerified: true,
        lastLoginAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isPremium: true,
        avatarUrl: true,
      },
    });
  } else {
    // OIDC users never authenticate with a password; store an unguessable hash.
    const randomPassword = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
      'base64url'
    );
    user = await prisma.user.create({
      data: {
        email: claims.email,
        firstName,
        lastName,
        password: await auth.hashPassword(randomPassword),
        avatarUrl: httpsPicture(claims.picture),
        emailVerified: true,
        role: UserRole.USER,
        lastLoginAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isPremium: true,
        avatarUrl: true,
      },
    });
    logger.info({ email: claims.email }, '[OIDC] Provisioned new user');
  }

  await recordIdentity(auth, user.id, claims);

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as unknown as SessionUser['role'],
    isPremium: user.isPremium,
    avatarUrl: user.avatarUrl,
    coverImageUrl: null,
  };

  return { token: await auth.createToken(sessionUser), user: sessionUser };
}

export const oidcSuccessUrl = successUrl;
