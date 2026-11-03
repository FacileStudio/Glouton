import type { PrismaClient } from '@prisma/client';
import type { AuthManager } from '@repo/auth';
import { SMTPService } from '@repo/smtp';
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
}

export interface SendOutreachResult {
  transport: 'smtp';
}

/**
 * The one place Glouton hands a mail to a transport. Today that is the
 * scope's SMTP account; a Courrier transport plugs in here later.
 */
export async function sendOutreach(params: SendOutreachParams): Promise<SendOutreachResult> {
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
