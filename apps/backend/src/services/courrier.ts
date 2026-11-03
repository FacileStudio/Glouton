import type { PrismaClient } from '@prisma/client';
import { CourrierClient, type RefreshTokenStore } from '@repo/courrier';
import { logger } from '@repo/logger';

export interface Cipher {
  encryptData(text: string): string;
  decryptData(data: string): string;
}

export interface CourrierSettings {
  COURRIER_URL?: string;
  COURRIER_AUDIENCE?: string;
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
}

/**
 * Keeps the user's Registre refresh token on their `Account` row for the
 * configured issuer, encrypted at rest. Registre rotates the token on every
 * refresh, so `save` overwrites the one that was just spent.
 */
export function accountTokenStore(prisma: PrismaClient, issuer: string, cipher: Cipher): RefreshTokenStore {
  const providerId = issuer.replace(/\/$/, '');
  return {
    async load(userId) {
      const account = await prisma.account.findFirst({
        where: { userId, providerId, refreshToken: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { refreshToken: true },
      });
      if (!account?.refreshToken) return null;
      try {
        return cipher.decryptData(account.refreshToken);
      } catch {
        return null;
      }
    },
    async save(userId, refreshToken) {
      await prisma.account.updateMany({
        where: { userId, providerId },
        data: { refreshToken: cipher.encryptData(refreshToken) },
      });
    },
  };
}

/** The Courrier client, or null when COURRIER_URL or the Registre client is not configured. */
export function courrierFromEnv(env: CourrierSettings, prisma: PrismaClient, cipher: Cipher): CourrierClient | null {
  if (!env.COURRIER_URL) {
    logger.info('[COURRIER] COURRIER_URL unset: Courrier transport, reply sync and contact import are off');
    return null;
  }
  if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID || !env.OIDC_CLIENT_SECRET) {
    logger.warn('[COURRIER] COURRIER_URL is set but OIDC is not configured: Courrier stays off');
    return null;
  }
  return new CourrierClient({
    courrierUrl: env.COURRIER_URL,
    issuer: env.OIDC_ISSUER,
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET,
    audience: env.COURRIER_AUDIENCE,
    store: accountTokenStore(prisma, env.OIDC_ISSUER, cipher),
  });
}
