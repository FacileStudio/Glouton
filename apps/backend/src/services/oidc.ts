import { SignJWT, createRemoteJWKSet, jwtVerify } from 'jose';
import { prisma } from '@repo/database';
import type { AuthManager, SessionUser } from '@repo/auth';
import { UserRole } from '@repo/types';
import { logger } from '@repo/logger';
import env from '../env';

/**
 * Registre OIDC (authorization code flow with PKCE and a nonce), the only way
 * to sign in to Glouton:
 *   GET /auth/oidc          -> redirect to Registre
 *   GET /auth/oidc/callback -> exchange code, resolve the user, redirect to the app
 */

export interface OidcClaims {
  email: string;
  emailVerified?: boolean;
  subject?: string;
  locale?: string;
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

/** The issuer exactly as discovery names it, with its signing keys, both found through OIDC discovery and cached. */
export async function registreTrust(): Promise<{ issuer: string; keys: ReturnType<typeof createRemoteJWKSet> }> {
  const doc = await discover();
  return { issuer: doc.issuer, keys: jwks(doc.jwks_uri) };
}

/** The issuer's signing keys alone. */
export const registreKeys = async (): Promise<ReturnType<typeof createRemoteJWKSet>> => (await registreTrust()).keys;

const STATE_AUDIENCE = 'oidc-state';
export const STATE_COOKIE = 'oidc_state';
export const STATE_TTL_SECONDS = 10 * 60;

export interface LoginState {
  state: string;
  nonce: string;
  verifier: string;
}

const randomToken = (bytes: number): string =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString('base64url');

const pkceChallenge = async (verifier: string): Promise<string> =>
  Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');

const stateKey = () => new TextEncoder().encode(env.ENCRYPTION_SECRET);

/** Seals the login state into a short-lived signed cookie value, so the callback needs no server memory. */
export function sealState(payload: LoginState): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(STATE_AUDIENCE)
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .sign(stateKey());
}

/** Opens a sealed state cookie, or null when it is forged, expired or malformed. */
export async function openState(cookie: string): Promise<LoginState | null> {
  try {
    const { payload } = await jwtVerify(cookie, stateKey(), { audience: STATE_AUDIENCE });
    const { state, nonce, verifier } = payload as Record<string, unknown>;
    if (typeof state !== 'string' || typeof nonce !== 'string' || typeof verifier !== 'string') return null;
    return { state, nonce, verifier };
  } catch {
    return null;
  }
}

/** Starts a sign-in: the authorization URL and the sealed cookie the callback checks. */
export async function startLogin(): Promise<{ url: string; cookie: string }> {
  const doc = await discover();
  const login: LoginState = { state: randomToken(16), nonce: randomToken(16), verifier: randomToken(32) };
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.OIDC_CLIENT_ID!,
    redirect_uri: redirectUrl,
    scope: 'openid email profile offline_access',
    state: login.state,
    nonce: login.nonce,
    code_challenge: await pkceChallenge(login.verifier),
    code_challenge_method: 'S256',
  });
  return { url: `${doc.authorization_endpoint}?${params.toString()}`, cookie: await sealState(login) };
}

/** Maps a `locale` claim, a BCP 47 tag such as fr-FR, onto fr, en, es or de; null when it names none. */
export function normalizeLocale(tag: string | undefined): string | null {
  const primary = tag?.trim().toLowerCase().split(/[-_]/)[0];
  return primary && ['fr', 'en', 'es', 'de'].includes(primary) ? primary : null;
}

export async function exchangeCode(code: string, login: Pick<LoginState, 'nonce' | 'verifier'>): Promise<OidcClaims> {
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
      code_verifier: login.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  });

  if (!response.ok) {
    logger.error({ status: response.status }, '[OIDC] Token exchange failed');
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
  if (payload.nonce !== login.nonce) {
    throw new Error('OIDC nonce mismatch');
  }

  const email = typeof payload.email === 'string' ? payload.email : '';
  if (!email) {
    throw new Error('OIDC provider did not return an email');
  }
  if (typeof payload.sub !== 'string' || payload.sub === '') {
    throw new Error('OIDC provider did not return a subject');
  }

  const str = (value: unknown): string | undefined =>
    typeof value === 'string' && value !== '' ? value : undefined;

  return {
    email,
    emailVerified: payload.email_verified === true,
    subject: payload.sub,
    locale: str(payload.locale),
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

export type IdentityFailure = 'email_unverified' | 'identity_conflict' | 'unverified_account';

/** Raised when a sign-in must not resolve to an account; `code` is the short reason the login page shows. */
export class IdentityError extends Error {
  constructor(readonly code: IdentityFailure, message: string = code) {
    super(message);
    this.name = 'IdentityError';
  }
}

/** Raised when an SSO sign-in matches a local account Glouton never verified. */
export class UnverifiedAccountError extends IdentityError {
  constructor() {
    super(
      'unverified_account',
      'An unverified local account already uses this email; an administrator must verify it before SSO can link it'
    );
  }
}

/**
 * Finds the user for an SSO sign-in: by Registre identity (issuer, sub) first,
 * so a user pre-provisioned by the directory sync lands on their row, then by
 * email. The email fallback and the creation of a new user both need Registre
 * to assert the email as verified. The fallback links only a local account
 * whose email Glouton marked verified (an earlier SSO sign-in, the directory
 * sync, or an admin), and refuses an account that already holds another
 * subject of the same issuer, so an identity is never rebound to a second
 * person. An unverified match is refused, not replaced.
 */
export async function findOidcUser(
  claims: Pick<OidcClaims, 'email' | 'subject' | 'emailVerified'>,
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
  if (claims.emailVerified !== true) throw new IdentityError('email_unverified');
  const local = await db.user.findFirst({
    where: { email: { equals: claims.email, mode: 'insensitive' } },
    select: { id: true, emailVerified: true },
  });
  if (!local) return null;
  if (!local.emailVerified) throw new UnverifiedAccountError();
  if (issuer) {
    const other = await db.account.findFirst({ where: { userId: local.id, providerId: issuer }, select: { id: true } });
    if (other) throw new IdentityError('identity_conflict');
  }
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

/**
 * Signs a person in from verified Registre claims and returns a Glouton
 * session for them.
 */
export async function loginWithOidc(
  auth: AuthManager,
  claims: OidcClaims
): Promise<{ token: string; user: SessionUser }> {
  const user = await persistOidcUser(auth, claims);
  return { token: await auth.createToken(user), user };
}

/**
 * Writes the account of a person from verified Registre claims, creating it
 * on their first sign-in. Two first sign-ins for one new email can race on
 * the unique email: the loser retries once and lands on the row the winner
 * created.
 */
export async function persistOidcUser(auth: AuthManager, claims: OidcClaims): Promise<SessionUser> {
  try {
    return await signIn(auth, claims);
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error;
    return signIn(auth, claims);
  }
}

async function signIn(auth: AuthManager, claims: OidcClaims): Promise<SessionUser> {
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
        locale: normalizeLocale(claims.locale) ?? undefined,
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
        locale: true,
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
        locale: normalizeLocale(claims.locale),
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
        locale: true,
      },
    });
    logger.info({ email: claims.email }, '[OIDC] Provisioned new user');
  }

  await recordIdentity(auth, user.id, claims);

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as unknown as SessionUser['role'],
    isPremium: user.isPremium,
    avatarUrl: user.avatarUrl,
    coverImageUrl: null,
    locale: user.locale,
  };
}

export const oidcSuccessUrl = successUrl;

/** The login page an SSO failure sends the browser back to. */
export const oidcLoginUrl = `${env.DOMAIN}/login`;

/**
 * Where a failed SSO callback redirects: the login page with a short error
 * code it turns into a message. Only the code travels, never error details.
 */
export function ssoFailureUrl(error: unknown, loginUrl: string = oidcLoginUrl): string {
  const code = error instanceof IdentityError ? error.code : 'sso_failed';
  return `${loginUrl}?sso_error=${code}`;
}
