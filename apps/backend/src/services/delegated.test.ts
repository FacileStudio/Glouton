import { describe, expect, test } from 'bun:test';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload } from 'jose';
import type { SessionUser } from '@repo/auth';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://unused@localhost/unused';
process.env.DOMAIN ??= 'http://localhost:3000';
process.env.ENCRYPTION_SECRET ??= 'test-encryption-secret-at-least-32-chars';

const { createDelegatedVerifier } = await import('./delegated');
const { appRouter, createContext } = await import('@repo/trpc');

const issuer = 'https://sso.test';
const audience = '1IdqK3bA2LWI-zuWVLqFpnIlCTVu117F';
const { privateKey, publicKey } = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' };
const keySet = createLocalJWKSet({ keys: [jwk] });

const alice = {
  id: 'user-alice',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'A',
  role: 'USER',
  isPremium: false,
  avatarUrl: null,
  isBanned: false,
};

const verify = createDelegatedVerifier({
  issuer,
  audience,
  keys: async () => keySet,
  findBySubject: async (_issuer, subject) => (subject === 'sub-alice' ? alice : null),
  findByEmail: async (email) => (email === alice.email ? alice : null),
});

async function sign(claims: JWTPayload, opts: { aud?: string; iss?: string; exp?: string | number } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setIssuer(opts.iss ?? issuer)
    .setAudience(opts.aud ?? audience)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(privateKey);
}

const bulle = { sub: 'sub-alice', scope: 'glouton.read glouton.write', act: { sub: 'bulle' } };

describe('createDelegatedVerifier', () => {
  test('accepts a valid delegated token and records the act claim', async () => {
    const principal = await verify(await sign(bulle));
    expect(principal?.user.id).toBe('user-alice');
    expect(principal?.actor).toBe('bulle');
    expect(principal?.scopes).toEqual(['glouton.read', 'glouton.write']);
  });

  test('rejects another audience', async () => {
    expect(await verify(await sign(bulle, { aud: 'courrier' }))).toBeNull();
  });

  test('rejects another issuer', async () => {
    expect(await verify(await sign(bulle, { iss: 'https://evil.test' }))).toBeNull();
  });

  test('rejects an expired token', async () => {
    expect(await verify(await sign(bulle, { exp: Math.floor(Date.now() / 1000) - 60 }))).toBeNull();
  });

  test('rejects a token without a glouton scope', async () => {
    expect(await verify(await sign({ ...bulle, scope: 'courrier.read' }))).toBeNull();
  });

  test('maps by email only when email_verified is true', async () => {
    const byEmail = { sub: 'sub-unknown', scope: 'glouton.read', email: 'alice@example.com' };
    expect(await verify(await sign({ ...byEmail, email_verified: false }))).toBeNull();
    expect((await verify(await sign({ ...byEmail, email_verified: true })))?.user.id).toBe('user-alice');
  });

  test('rejects a token signed by another key', async () => {
    const other = await generateKeyPair('ES256');
    const forged = await new SignJWT(bulle)
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime('5m')
      .sign(other.privateKey);
    expect(await verify(forged)).toBeNull();
  });
});

const sessionUser: SessionUser = {
  id: 'user-alice',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'A',
  role: 'USER' as SessionUser['role'],
  isPremium: false,
};

const silentLogger = {
  child: () => silentLogger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const fakePrisma = {
  lead: { findUnique: async () => null },
  forfaitState: { findUnique: async () => null },
};

async function callerFor(token: string) {
  const ctx = await createContext({
    req: new Request('http://glouton.test/trpc', { headers: { authorization: `Bearer ${token}` } }),
    resHeaders: new Headers(),
    info: {} as never,
    prisma: fakePrisma as never,
    authManager: { verifyToken: async (t: string) => (t === 'session-token' ? sessionUser : null) } as never,
    env: {} as never,
    logger: silentLogger as never,
    jobs: {} as never,
    verifyDelegated: verify,
  });
  return { ctx, caller: appRouter.createCaller(ctx) };
}

const sendInput = { leadId: 'lead-1', templateId: 'intro', variables: {} };
const freeTextInput = { leadId: 'lead-1', subject: 'Bonjour', text: 'Un mot.' };

describe('humanProcedure guard', () => {
  test('a delegated token is refused on send with FORBIDDEN', async () => {
    const { ctx, caller } = await callerFor(await sign(bulle));
    expect(ctx.actor).toBe('bulle');
    await expect(caller.email.sendEmail(sendInput)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.email.sendToLead(freeTextInput)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('a delegated token is refused on SMTP settings', async () => {
    const { caller } = await callerFor(await sign(bulle));
    await expect(
      caller.user.updateSmtpConfig({
        smtpHost: 'smtp.test',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: 'u',
        smtpPass: 'p',
        smtpFromName: 'n',
        smtpFromEmail: 'n@test.dev',
      } as never)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('a session token passes the guard and reaches the service', async () => {
    const { ctx, caller } = await callerFor('session-token');
    expect(ctx.actor).toBeNull();
    await expect(caller.email.sendEmail(sendInput)).rejects.toThrow('Lead not found');
    await expect(caller.email.sendToLead(freeTextInput)).rejects.toThrow('Lead not found');
  });

  test('a read-only delegated token cannot call a mutation', async () => {
    const { caller } = await callerFor(await sign({ ...bulle, scope: 'glouton.read' }));
    await expect(caller.team.leave({ teamId: crypto.randomUUID() } as never)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
