import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload } from 'jose';
import { AuthManager } from '@repo/auth';
import { UserRole } from '@repo/types';
import { prisma } from '@repo/database';
import {
  BackchannelLogoutEvent,
  BackchannelLogoutPath,
  LogoutTokenError,
  revokeSubject,
  verifyLogoutToken,
  type LogoutTrust,
} from './backchannel-logout';
import { sessionValid } from './session';
import { createBackchannelLogoutRoutes } from '../handlers/backchannel-logout';

const databaseUrl = process.env.TEST_DATABASE_URL;
const issuer = 'https://sso.example.test';
const audience = 'glouton-client';

let trust: LogoutTrust;
let sign: (claims: JWTPayload) => Promise<string>;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  trust = { issuer, audience, keys: createLocalJWKSet({ keys: [jwk] }) };
  sign = (claims) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(privateKey);
});

const logoutClaims = (overrides: JWTPayload = {}): JWTPayload => ({
  iss: issuer,
  aud: [audience],
  sub: 'sub-a',
  jti: crypto.randomUUID(),
  events: { [BackchannelLogoutEvent]: {} },
  ...overrides,
});

describe('verifyLogoutToken', () => {
  test('accepts a valid logout token and returns its sub', async () => {
    expect(await verifyLogoutToken(await sign(logoutClaims()), trust)).toBe('sub-a');
  });

  const refused: Array<[string, JWTPayload]> = [
    ['a nonce', { nonce: 'n' }],
    ['another audience', { aud: ['someone-else'] }],
    ['another issuer', { iss: 'https://evil.example.test' }],
    ['no backchannel-logout event', { events: { 'https://example.test/other': {} } }],
    ['an event that is not an object', { events: { [BackchannelLogoutEvent]: true } }],
    ['no sub', { sub: undefined, sid: 's1' }],
  ];
  for (const [name, overrides] of refused) {
    test(`refuses a token with ${name}`, async () => {
      expect(verifyLogoutToken(await sign(logoutClaims(overrides)), trust)).rejects.toBeInstanceOf(LogoutTokenError);
    });
  }

  test('refuses a token signed by another key', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT(logoutClaims())
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(privateKey);
    expect(verifyLogoutToken(forged, trust)).rejects.toBeInstanceOf(LogoutTokenError);
  });
});

describe('back-channel logout route', () => {
  const post = async (body: string, revoked: string[]) => {
    const routes = createBackchannelLogoutRoutes({
      verify: (token) => verifyLogoutToken(token, trust),
      revoke: async (sub) => {
        revoked.push(sub);
        return ['u1'];
      },
    });
    return routes.request(BackchannelLogoutPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  };

  test('a valid token revokes its subject and answers 200, no-store', async () => {
    const revoked: string[] = [];
    const res = await post(new URLSearchParams({ logout_token: await sign(logoutClaims()) }).toString(), revoked);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(revoked).toEqual(['sub-a']);
  });

  test('a token with a nonce or a wrong audience answers 400 and revokes nobody', async () => {
    const revoked: string[] = [];
    for (const overrides of [{ nonce: 'n' }, { aud: ['someone-else'] }]) {
      const res = await post(new URLSearchParams({ logout_token: await sign(logoutClaims(overrides)) }).toString(), revoked);
      expect(res.status).toBe(400);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(revoked).toEqual([]);
  });

  test('a request without logout_token answers 400', async () => {
    const revoked: string[] = [];
    expect((await post('', revoked)).status).toBe(400);
    expect(revoked).toEqual([]);
  });
});

describe('sessionValid', () => {
  const at = (revokedAt: Date | null, present = true) =>
    sessionValid({
      user: { findUnique: async () => (present ? { sessionsRevokedAt: revokedAt } : null) },
    } as never);

  test('a token issued in or before the revocation second fails, a later one stands', async () => {
    const revokedAt = new Date('2026-11-13T10:00:00.500Z');
    const second = revokedAt.getTime() / 1000;
    expect(await at(revokedAt)('u', Math.floor(second))).toBe(false);
    expect(await at(revokedAt)('u', Math.floor(second) - 60)).toBe(false);
    expect(await at(revokedAt)('u', Math.floor(second) + 1)).toBe(true);
    expect(await at(null)('u', 1)).toBe(true);
    expect(await at(null, false)('u', 1)).toBe(false);
  });
});

describe.skipIf(!databaseUrl)('revokeSubject against the database', () => {
  const secret = process.env.ENCRYPTION_SECRET!;
  const auth = new AuthManager({ encryptionSecret: secret, sessionValid: sessionValid(prisma) });
  const sessionOf = (id: string) => ({
    id,
    email: `${id}@example.com`,
    firstName: 'A',
    lastName: 'B',
    role: UserRole.USER,
    isPremium: false,
  });
  const created: string[] = [];

  const person = async (email: string, sub: string) => {
    const user = await prisma.user.create({
      data: { email, firstName: 'A', lastName: 'B', password: 'x', emailVerified: true },
    });
    created.push(user.id);
    await prisma.account.create({ data: { userId: user.id, providerId: issuer, accountId: sub } });
    return user;
  };

  test("revokes the subject's sessions and leaves another person's alone", async () => {
    const a = await person('bcl-a@example.com', 'sub-a');
    const b = await person('bcl-b@example.com', 'sub-b');
    const tokenA = await auth.createToken(sessionOf(a.id));
    const tokenB = await auth.createToken(sessionOf(b.id));

    expect(await revokeSubject(prisma, issuer, 'sub-a')).toEqual([a.id]);

    expect(await auth.verifyToken(tokenA)).toBeNull();
    expect((await auth.verifyToken(tokenB))?.id).toBe(b.id);
  });

  test('a subject of another issuer or an unknown subject revokes nobody', async () => {
    const c = await person('bcl-c@example.com', 'sub-c');
    const tokenC = await auth.createToken(sessionOf(c.id));

    expect(await revokeSubject(prisma, 'https://other.example.test', 'sub-c')).toEqual([]);
    expect(await revokeSubject(prisma, issuer, 'sub-unknown')).toEqual([]);

    expect((await auth.verifyToken(tokenC))?.id).toBe(c.id);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: created } } });
  });
});

afterAll(() => prisma.$disconnect());
