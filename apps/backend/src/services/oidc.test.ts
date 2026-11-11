import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { PrismaClient } from '@prisma/client';

/**
 * Run with TEST_DATABASE_URL pointing at a throwaway, fully migrated
 * database: the identity tests create and delete their own users.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://unused@localhost/unused';
process.env.DOMAIN = 'http://localhost:3000';
process.env.ENCRYPTION_SECRET ??= 'test-encryption-secret-at-least-32-chars';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
let lastTokenRequest: URLSearchParams | null = null;
let nonceToSign = '';

const idpPort = 38917;

const idp = Bun.serve({
  port: idpPort,
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const base = `http://localhost:${idpPort}`;
    if (url.pathname === '/.well-known/openid-configuration') {
      return Response.json({
        issuer: base,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        jwks_uri: `${base}/jwks`,
      });
    }
    if (url.pathname === '/jwks') return Response.json({ keys: [jwk] });
    if (url.pathname === '/token') {
      lastTokenRequest = new URLSearchParams(await request.text());
      const idToken = await new SignJWT({ email: 'flow@example.com', email_verified: true, nonce: nonceToSign, locale: 'de-CH' })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(base)
        .setAudience('glouton')
        .setSubject('flow-sub')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
      return Response.json({ id_token: idToken });
    }
    return new Response(null, { status: 404 });
  },
});

const oidc = await import('./oidc');
const bearer = await import('./bearer');
const { AuthManager } = await import('@repo/auth');

if (!databaseUrl) console.warn('[oidc.test] TEST_DATABASE_URL unset: skipping the identity DB tests');

afterAll(() => idp.stop(true));

describe('sign-in flow', () => {
  test('the authorization URL carries PKCE and a nonce, and the sealed state opens', async () => {
    const login = await oidc.startLogin();
    const url = new URL(login.url);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    const saved = await oidc.openState(login.cookie);
    expect(saved?.state).toBe(url.searchParams.get('state') ?? undefined);
    expect(saved?.nonce).toBe(url.searchParams.get('nonce') ?? undefined);
  });

  test('a forged or tampered state cookie is refused', async () => {
    const login = await oidc.startLogin();
    expect(await oidc.openState(`${login.cookie}x`)).toBeNull();
    expect(await oidc.openState('not.a.jwt')).toBeNull();
  });

  test('the code exchange sends the PKCE verifier and checks the nonce', async () => {
    const saved = { nonce: 'n-1', verifier: 'v-1' };
    nonceToSign = 'n-1';
    const claims = await oidc.exchangeCode('code-1', saved);
    expect(lastTokenRequest?.get('code_verifier')).toBe('v-1');
    expect(claims).toMatchObject({ subject: 'flow-sub', email: 'flow@example.com', emailVerified: true, locale: 'de-CH' });
    nonceToSign = 'someone-elses';
    await expect(oidc.exchangeCode('code-1', saved)).rejects.toThrow('nonce');
  });

  test('locale claims map onto the four languages', () => {
    expect(oidc.normalizeLocale('fr-FR')).toBe('fr');
    expect(oidc.normalizeLocale('DE_ch')).toBe('de');
    expect(oidc.normalizeLocale('it')).toBeNull();
    expect(oidc.normalizeLocale(undefined)).toBeNull();
  });
});

describe.skipIf(!databaseUrl)('identity resolution against the database', () => {
  let db: PrismaClient;
  const auth = new AuthManager({ encryptionSecret: process.env.ENCRYPTION_SECRET! });
  const issuer = () => oidc.registreIssuer()!;
  const claims = (overrides: Partial<import('./oidc').OidcClaims> = {}) => ({
    email: 'person@example.com',
    emailVerified: true,
    subject: 'sub-person',
    name: 'Per Son',
    locale: 'es-ES',
    ...overrides,
  });

  beforeAll(async () => {
    ({ prisma: db } = await import('@repo/database'));
    await db.user.deleteMany({ where: { email: { endsWith: '@example.com' } } });
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { endsWith: '@example.com' } } });
  });

  test('a first verified sign-in creates the user with the locale and the identity', async () => {
    const { user } = await oidc.loginWithOidc(auth, claims());
    expect(user).toMatchObject({ email: 'person@example.com', firstName: 'Per', lastName: 'Son', locale: 'es' });
    const account = await db.account.findUnique({
      where: { providerId_accountId: { providerId: issuer(), accountId: 'sub-person' } },
    });
    expect(account?.userId).toBe(user.id);
  });

  test('the same subject signs in again as the same user, even with a new email case', async () => {
    const first = await oidc.loginWithOidc(auth, claims());
    const second = await oidc.loginWithOidc(auth, claims({ email: 'Person@Example.com' }));
    expect(second.user.id).toBe(first.user.id);
  });

  test('an unverified email never signs in nor creates a user', async () => {
    await expect(
      oidc.loginWithOidc(auth, claims({ email: 'ghost@example.com', subject: 'sub-ghost', emailVerified: false }))
    ).rejects.toMatchObject({ code: 'email_unverified' });
    expect(await db.user.findFirst({ where: { email: 'ghost@example.com' } })).toBeNull();
  });

  test('a verified local account links by verified email, once', async () => {
    const legacy = await db.user.create({
      data: { email: 'legacy@example.com', firstName: 'L', lastName: 'G', password: 'x', emailVerified: true },
    });
    const { user } = await oidc.loginWithOidc(auth, claims({ email: 'legacy@example.com', subject: 'sub-legacy' }));
    expect(user.id).toBe(legacy.id);
  });

  test('an account holding another subject of the issuer refuses a second subject', async () => {
    await expect(
      oidc.loginWithOidc(auth, claims({ email: 'legacy@example.com', subject: 'sub-intruder' }))
    ).rejects.toMatchObject({ code: 'identity_conflict' });
    const intruder = await db.account.findUnique({
      where: { providerId_accountId: { providerId: issuer(), accountId: 'sub-intruder' } },
    });
    expect(intruder).toBeNull();
  });

  test('an unverified local account is never linked', async () => {
    await db.user.create({
      data: { email: 'squat@example.com', firstName: 'S', lastName: 'Q', password: 'x', emailVerified: false },
    });
    await expect(
      oidc.loginWithOidc(auth, claims({ email: 'squat@example.com', subject: 'sub-squat' }))
    ).rejects.toMatchObject({ code: 'unverified_account' });
  });

  test('a first MCP call provisions the account from the access token, a second resolves the same row', async () => {
    const token = { sub: 'sub-mcp', email: 'mcp-first@example.com', email_verified: true, name: 'Em Cee' };
    const id = await bearer.bearerUser(auth, bearer.bearerClaims(token));
    expect(id).toBeString();
    const user = await db.user.findUnique({ where: { id: id! }, select: { firstName: true, emailVerified: true } });
    expect(user).toEqual({ firstName: 'Em', emailVerified: true });
    expect(await bearer.bearerUser(auth, bearer.bearerClaims({ sub: 'sub-mcp' }))).toBe(id);
  });

  test('an MCP token without a verified email, or for a banned account, is refused', async () => {
    const unverified = { sub: 'sub-mcp-ghost', email: 'mcp-ghost@example.com', email_verified: false };
    expect(await bearer.bearerUser(auth, bearer.bearerClaims(unverified))).toBeUndefined();
    expect(await bearer.bearerUser(auth, bearer.bearerClaims({ sub: 'sub-mcp-none' }))).toBeUndefined();
    expect(await db.user.findFirst({ where: { email: 'mcp-ghost@example.com' } })).toBeNull();
    const banned = { sub: 'sub-mcp-banned', email: 'mcp-banned@example.com', email_verified: true };
    const id = await bearer.bearerUser(auth, bearer.bearerClaims(banned));
    await db.user.update({ where: { id: id! }, data: { isBanned: true } });
    expect(await bearer.bearerUser(auth, bearer.bearerClaims(banned))).toBeUndefined();
  });
});
