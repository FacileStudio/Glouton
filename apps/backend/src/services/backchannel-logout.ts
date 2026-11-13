import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { PrismaClient } from '@prisma/client';
import { revokeSessions } from './session';

/** Where Registre POSTs logout tokens; the backchannel_logout_uri to register is the app origin plus this path. */
export const BackchannelLogoutPath = '/api/auth/backchannel-logout';

/** The event key OpenID Connect Back-Channel Logout 1.0 fixes for a logout token. */
export const BackchannelLogoutEvent = 'http://schemas.openid.net/event/backchannel-logout';

const clockToleranceSeconds = 60;

/** A logout token that fails validation; the receiver answers 400. */
export class LogoutTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LogoutTokenError';
  }
}

export interface LogoutTrust {
  issuer: string;
  audience: string;
  keys: JWTVerifyGetKey;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validates a logout token as Back-Channel Logout 1.0 section 2.6 asks:
 * signature against the issuer's keys, iss, aud, iat and exp, the
 * backchannel-logout event as a JSON object, no nonce, and a sub. Glouton
 * sessions carry no sid, so a token without sub cannot be acted on and is
 * refused. Returns the subject. A key fetch timeout is rethrown as is, so the
 * caller answers 5xx instead of blaming the token.
 */
export async function verifyLogoutToken(token: string, trust: LogoutTrust): Promise<string> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, trust.keys, {
      issuer: trust.issuer,
      audience: trust.audience,
      requiredClaims: ['iat', 'exp'],
      clockTolerance: clockToleranceSeconds,
    }));
  } catch (error) {
    if (error instanceof errors.JWKSTimeout || !(error instanceof errors.JOSEError)) throw error;
    throw new LogoutTokenError(error.code);
  }
  if ('nonce' in payload) throw new LogoutTokenError('nonce present');
  if (!isObject(payload.events) || !isObject(payload.events[BackchannelLogoutEvent])) {
    throw new LogoutTokenError('backchannel-logout event missing');
  }
  if (typeof payload.sub !== 'string' || payload.sub === '') throw new LogoutTokenError('sub missing');
  return payload.sub;
}

/** Ends every Glouton session of the person Registre knows as `sub`; returns the users it signed out. */
export async function revokeSubject(
  db: Pick<PrismaClient, 'account' | 'user'>,
  issuer: string,
  sub: string
): Promise<string[]> {
  const accounts = await db.account.findMany({
    where: { providerId: issuer, accountId: sub },
    select: { userId: true },
  });
  const userIds = accounts.map((account) => account.userId);
  await revokeSessions(db, userIds);
  return userIds;
}
