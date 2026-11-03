import { jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { SessionUser } from '@repo/auth';
import { prisma } from '@repo/database';
import { logger } from '@repo/logger';
import { READ_SCOPE, WRITE_SCOPE, type DelegatedPrincipal, type DelegatedVerifier } from '@repo/trpc/delegation';

export interface DelegatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isPremium: boolean;
  avatarUrl: string | null;
  isBanned: boolean;
}

export interface DelegatedDeps {
  issuer: string;
  audience: string;
  keys: () => Promise<JWTVerifyGetKey>;
  findBySubject: (issuer: string, subject: string) => Promise<DelegatedUser | null>;
  findByEmail: (email: string) => Promise<DelegatedUser | null>;
  onReject?: (reason: string) => void;
}

const GLOUTON_SCOPES = [READ_SCOPE, WRITE_SCOPE];

function scopesOf(payload: JWTPayload): string[] {
  const raw = payload.scope ?? payload.scp;
  if (typeof raw === 'string') return raw.split(/\s+/).filter(Boolean);
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string');
  return [];
}

/** Names the agent acting for the user, from the RFC 8693 `act` claim, else the client. */
function actorOf(payload: JWTPayload): string {
  const act = payload.act;
  if (act && typeof act === 'object' && !Array.isArray(act)) {
    const record = act as Record<string, unknown>;
    const name = record.sub ?? record.client_id;
    if (typeof name === 'string' && name !== '') return name;
  }
  const azp = payload.azp ?? payload.client_id;
  return typeof azp === 'string' && azp !== '' ? azp : 'delegated';
}

function toSessionUser(user: DelegatedUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as SessionUser['role'],
    isPremium: user.isPremium,
    avatarUrl: user.avatarUrl,
    coverImageUrl: null,
  };
}

/**
 * Verifies a Registre delegated access token for Glouton: signature against
 * the issuer JWKS, `iss`, `aud`, `exp`, at least one glouton scope, then maps
 * the subject to a user through `Account`, falling back to a verified email.
 */
export function createDelegatedVerifier(deps: DelegatedDeps): DelegatedVerifier {
  const issuer = deps.issuer.replace(/\/$/, '');
  const reject = (reason: string): null => {
    deps.onReject?.(reason);
    return null;
  };

  return async (token) => {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, await deps.keys(), {
        issuer: [issuer, `${issuer}/`],
        audience: deps.audience,
        requiredClaims: ['exp', 'sub'],
      }));
    } catch (error) {
      return reject(error instanceof Error ? error.message : 'invalid token');
    }

    const scopes = scopesOf(payload);
    if (!scopes.some((s) => GLOUTON_SCOPES.includes(s))) return reject('missing glouton scope');

    const subject = payload.sub!;
    let user = await deps.findBySubject(issuer, subject);
    if (!user && typeof payload.email === 'string' && payload.email !== '') {
      if (payload.email_verified !== true) return reject('email not verified');
      user = await deps.findByEmail(payload.email.toLowerCase());
    }
    if (!user) return reject('unknown user');
    if (user.isBanned) return reject('user banned');

    const principal: DelegatedPrincipal = {
      user: toSessionUser(user),
      actor: actorOf(payload),
      subject,
      scopes,
    };
    return principal;
  };
}

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isPremium: true,
  avatarUrl: true,
  isBanned: true,
} as const;

/** The production verifier, or null when OIDC is not configured. */
export function delegatedVerifierFromEnv(env: {
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
}, keys: () => Promise<JWTVerifyGetKey>): DelegatedVerifier | null {
  if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID) return null;
  return createDelegatedVerifier({
    issuer: env.OIDC_ISSUER,
    audience: env.OIDC_CLIENT_ID,
    keys,
    findBySubject: async (issuer, subject) => {
      const account = await prisma.account.findUnique({
        where: { providerId_accountId: { providerId: issuer, accountId: subject } },
        select: { user: { select: userSelect } },
      });
      return account?.user ?? null;
    },
    findByEmail: (email) =>
      prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: userSelect,
      }),
    onReject: (reason) => logger.debug({ reason }, '[DELEGATED] Token rejected'),
  });
}
