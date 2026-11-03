import type { PrismaClient } from '@prisma/client';
import type { AuthManager } from '@repo/auth';
import { CourrierReconnectError, type CourrierClient } from '@repo/courrier';
import { logger } from '@repo/logger';
import { SMTPService } from '@repo/smtp';
import { TRPCError } from '@trpc/server';
import { getSmtpConfig } from '../../utils/api-keys';
import type { Scope } from '../../utils/scope';

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendOutreachParams {
  prisma: PrismaClient;
  auth: AuthManager;
  scope: Scope;
  mail: OutgoingMail;
  courrier?: CourrierClient | null;
}

export type SendOutreachResult = { transport: 'smtp' } | { transport: 'courrier'; courrierAccountId: number };

export type MailTransport = { kind: 'smtp' } | { kind: 'courrier'; accountId: number };

export interface TransportSetting {
  mailTransport: string | null;
  courrierAccountId: number | null;
}

/**
 * The transport a scope sends with: the team's choice when the team made one,
 * else the user's. Courrier needs an account id and a configured integration;
 * anything else lands on SMTP.
 */
export function pickTransport(
  team: TransportSetting | null,
  user: TransportSetting | null,
  courrierEnabled: boolean
): MailTransport {
  const choice = team?.mailTransport ? team : user;
  if (courrierEnabled && choice?.mailTransport === 'COURRIER' && choice.courrierAccountId != null) {
    return { kind: 'courrier', accountId: choice.courrierAccountId };
  }
  return { kind: 'smtp' };
}

const settingSelect = { mailTransport: true, courrierAccountId: true } as const;

/** Reads the team and user settings for a scope and picks its transport. */
export async function resolveTransport(
  prisma: PrismaClient,
  scope: Scope,
  courrierEnabled: boolean
): Promise<MailTransport> {
  const [team, user] = await Promise.all([
    scope.type === 'team'
      ? prisma.team.findUnique({ where: { id: scope.teamId }, select: settingSelect })
      : Promise.resolve(null),
    prisma.user.findUnique({ where: { id: scope.userId }, select: settingSelect }),
  ]);
  return pickTransport(team, user, courrierEnabled);
}

/** Maps a lost Registre grant to a tRPC error the settings and send screens can show as is. */
export function courrierFailure(error: unknown): never {
  if (error instanceof CourrierReconnectError) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error.message });
  }
  throw error;
}

async function sendWithSmtp(params: SendOutreachParams): Promise<SendOutreachResult> {
  const smtpConfig = await getSmtpConfig(params.prisma, params.scope, params.auth);
  if (!smtpConfig) {
    const contextType = params.scope.type === 'team' ? 'team or your account' : 'your account';
    throw new Error(`SMTP configuration not found for ${contextType}. Please configure SMTP settings.`);
  }

  const smtp = new SMTPService({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: { user: smtpConfig.user, pass: smtpConfig.pass },
    from: { name: smtpConfig.fromName, email: smtpConfig.fromEmail },
  });

  try {
    await smtp.sendEmail({
      to: params.mail.to,
      subject: params.mail.subject,
      html: params.mail.html,
      text: params.mail.text,
    });
  } finally {
    await smtp.close();
  }
  return { transport: 'smtp' };
}

/**
 * The one place Glouton hands a mail to a transport: the chosen Courrier
 * account when the scope picked Courrier and the integration is configured,
 * else the scope's SMTP account. A Courrier failure is reported, never retried
 * over SMTP, so one click can never send twice.
 */
export async function sendOutreach(params: SendOutreachParams): Promise<SendOutreachResult> {
  const transport = await resolveTransport(params.prisma, params.scope, Boolean(params.courrier));
  if (transport.kind === 'smtp' || !params.courrier) return sendWithSmtp(params);

  logger.info({ scope: params.scope.type, courrierAccountId: transport.accountId }, '[EMAIL] Sending through Courrier');
  await params.courrier.send(params.scope.userId, transport.accountId, {
    to: [params.mail.to],
    subject: params.mail.subject,
    text: params.mail.text,
    html: params.mail.html,
  });
  return { transport: 'courrier', courrierAccountId: transport.accountId };
}
