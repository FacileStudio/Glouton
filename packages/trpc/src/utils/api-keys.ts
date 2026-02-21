import { PrismaClient } from '@prisma/client';
import type { Scope } from './scope';
import { logger } from '@repo/logger';
import { TRPCError } from '@trpc/server';
import { decrypt } from '@repo/utils';

export interface ApiKeys {
  hunterApiKey?: string;
  apolloApiKey?: string;
  snovApiKey?: string;
  hasdataApiKey?: string;
  contactoutApiKey?: string;
  googleMapsApiKey?: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

export async function getApiKeys(
  prisma: PrismaClient,
  scope: Scope,
  encryptionSecret: string
): Promise<ApiKeys> {
  if (scope.type === 'team') {
    const team = await prisma.$queryRaw<
      Array<{
        hunterApiKey: string | null;
        apolloApiKey: string | null;
        snovApiKey: string | null;
        hasdataApiKey: string | null;
        contactoutApiKey: string | null;
        googleMapsApiKey: string | null;
      }>
    >`
      SELECT
        "hunterApiKey",
        "apolloApiKey",
        "snovApiKey",
        "hasdataApiKey",
        "contactoutApiKey",
        "googleMapsApiKey"
      FROM "Team"
      WHERE "id" = ${scope.teamId}::text
      LIMIT 1
    `;

    if (!team || team.length === 0) {
      logger.error({ teamId: scope.teamId }, '[API_KEYS] Team not found');
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Team not found',
      });
    }

    const teamData = team[0];
    logger.info({ teamId: scope.teamId }, '[API_KEYS] Using team API keys');

    return {
      hunterApiKey: teamData.hunterApiKey
        ? decrypt(teamData.hunterApiKey, encryptionSecret)
        : undefined,
      apolloApiKey: teamData.apolloApiKey
        ? decrypt(teamData.apolloApiKey, encryptionSecret)
        : undefined,
      snovApiKey: teamData.snovApiKey
        ? decrypt(teamData.snovApiKey, encryptionSecret)
        : undefined,
      hasdataApiKey: teamData.hasdataApiKey
        ? decrypt(teamData.hasdataApiKey, encryptionSecret)
        : undefined,
      contactoutApiKey: teamData.contactoutApiKey
        ? decrypt(teamData.contactoutApiKey, encryptionSecret)
        : undefined,
      googleMapsApiKey: teamData.googleMapsApiKey
        ? decrypt(teamData.googleMapsApiKey, encryptionSecret)
        : undefined,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: scope.userId },
    select: {
      hunterApiKey: true,
      apolloApiKey: true,
      snovApiKey: true,
      hasdataApiKey: true,
      contactoutApiKey: true,
      googleMapsApiKey: true,
    },
  });

  if (!user) {
    logger.error({ userId: scope.userId }, '[API_KEYS] User not found');
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'User not found',
    });
  }

  logger.info({ userId: scope.userId }, '[API_KEYS] Using personal API keys');

  return {
    hunterApiKey: user.hunterApiKey ?? undefined,
    apolloApiKey: user.apolloApiKey ?? undefined,
    snovApiKey: user.snovApiKey ?? undefined,
    hasdataApiKey: user.hasdataApiKey ?? undefined,
    contactoutApiKey: user.contactoutApiKey ?? undefined,
    googleMapsApiKey: user.googleMapsApiKey ?? undefined,
  };
}

export async function getSmtpConfig(
  prisma: PrismaClient,
  scope: Scope,
  encryptionSecret: string
): Promise<SmtpConfig | null> {
  if (scope.type === 'team') {
    const team = await prisma.$queryRaw<
      Array<{
        smtpHost: string | null;
        smtpPort: number | null;
        smtpSecure: boolean | null;
        smtpUser: string | null;
        smtpPass: string | null;
        smtpFromName: string | null;
        smtpFromEmail: string | null;
      }>
    >`
      SELECT
        "smtpHost",
        "smtpPort",
        "smtpSecure",
        "smtpUser",
        "smtpPass",
        "smtpFromName",
        "smtpFromEmail"
      FROM "Team"
      WHERE "id" = ${scope.teamId}::text
      LIMIT 1
    `;

    if (!team || team.length === 0) {
      logger.warn({
        teamId: scope.teamId,
        userId: scope.userId,
      }, '[SMTP] Team not found, falling back to user SMTP');
      return getUserSmtpConfig(prisma, scope.userId, encryptionSecret);
    }

    const teamData = team[0];

    if (
      teamData.smtpHost &&
      teamData.smtpPort !== null &&
      teamData.smtpSecure !== null &&
      teamData.smtpUser &&
      teamData.smtpPass &&
      teamData.smtpFromName &&
      teamData.smtpFromEmail
    ) {
      logger.info({ teamId: scope.teamId }, '[SMTP] Using team SMTP config');
      return {
        host: teamData.smtpHost,
        port: teamData.smtpPort,
        secure: teamData.smtpSecure,
        user: decrypt(teamData.smtpUser, encryptionSecret),
        pass: decrypt(teamData.smtpPass, encryptionSecret),
        fromName: teamData.smtpFromName,
        fromEmail: teamData.smtpFromEmail,
      };
    }

    logger.info({
      teamId: scope.teamId,
      userId: scope.userId,
    }, '[SMTP] Team SMTP not configured, falling back to user');
    return getUserSmtpConfig(prisma, scope.userId, encryptionSecret);
  }

  return getUserSmtpConfig(prisma, scope.userId, encryptionSecret);
}

async function getUserSmtpConfig(
  prisma: PrismaClient,
  userId: string,
  encryptionSecret: string
): Promise<SmtpConfig | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      smtpPass: true,
      smtpFromName: true,
      smtpFromEmail: true,
    },
  });

  if (!user) {
    logger.error({ userId }, '[SMTP] User not found');
    return null;
  }

  if (
    !user.smtpHost ||
    user.smtpPort === null ||
    user.smtpSecure === null ||
    !user.smtpUser ||
    !user.smtpPass ||
    !user.smtpFromName ||
    !user.smtpFromEmail
  ) {
    logger.warn({ userId }, '[SMTP] User SMTP not configured');
    return null;
  }

  logger.info({ userId }, '[SMTP] Using personal SMTP config');

  return {
    host: user.smtpHost,
    port: user.smtpPort,
    secure: user.smtpSecure,
    user: user.smtpUser,
    pass: user.smtpPass,
    fromName: user.smtpFromName,
    fromEmail: user.smtpFromEmail,
  };
}
