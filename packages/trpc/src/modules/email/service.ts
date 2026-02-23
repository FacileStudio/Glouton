import type { PrismaClient } from '@prisma/client';
import { SMTPService, renderTemplate, type EmailTemplate } from '@repo/smtp';
import { buildEmailFilter, buildLeadFilter, type Scope } from '../../utils/scope';
import { getSmtpConfig } from '../../utils/api-keys';
import { logger } from '@repo/logger';
import type { AuthManager } from '@repo/auth';
import { verifyEmail } from '@repo/jobs';

export class EmailService {
  async sendEmail(params: {
    scope: Scope;
    leadId: string;
    templateId: string;
    variables: Record<string, string>;
    auth: AuthManager;
    prisma: PrismaClient;
  }) {
    const lead = await params.prisma.lead.findUnique({
      where: { id: params.leadId },
      select: { id: true, email: true, emailVerified: true },
    });

    if (!lead || !lead.email) {
      throw new Error('Lead not found or has no email');
    }

    if (lead.emailVerified === false) {
      throw new Error(`Cannot send email to ${lead.email}: Email address is invalid or unreachable`);
    }

    if (lead.emailVerified === null) {
      logger.info({ leadId: params.leadId, email: lead.email }, '[EMAIL] Verifying email before sending');

      const verification = await verifyEmail(lead.email);

      await params.prisma.lead.update({
        where: { id: lead.id },
        data: {
          emailVerified: verification.valid,
          emailVerifiedAt: verification.checkedAt,
          emailVerificationMethod: verification.reason,
        },
      });

      if (!verification.valid) {
        throw new Error(`Cannot send email to ${lead.email}: Email verification failed (${verification.reason})`);
      }

      logger.info({ leadId: params.leadId, email: lead.email, result: verification.reason }, '[EMAIL] Email verified successfully');
    }

    const smtpConfig = await getSmtpConfig(params.prisma, params.scope, params.auth);

    if (!smtpConfig) {
      const contextType = params.scope.type === 'team' ? 'team or your account' : 'your account';
      throw new Error(
        `SMTP configuration not found for ${contextType}. Please configure SMTP settings.`
      );
    }

    logger.info({
      leadId: params.leadId,
      scope: params.scope.type,
      teamId: params.scope.type === 'team' ? params.scope.teamId : null,
    }, '[EMAIL] Sending email');

    const smtp = new SMTPService({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
      from: {
        name: smtpConfig.fromName,
        email: smtpConfig.fromEmail,
      },
    });

    const rendered = renderTemplate(params.templateId, params.variables);
    if (!rendered) {
      throw new Error('Template not found');
    }

    const outreachData: any = {
      leadId: params.leadId,
      userId: params.scope.userId,
      templateId: params.templateId,
      subject: rendered.subject,
      htmlBody: rendered.html,
      textBody: rendered.text,
      variables: params.variables,
      status: 'PENDING',
    };

    if (params.scope.type === 'team') {
      outreachData.teamId = params.scope.teamId;
    } else {
      outreachData.teamId = null;
    }

    const outreach = await params.prisma.emailOutreach.create({
      data: outreachData,
      select: { id: true },
    });

    try {
      await smtp.sendEmail({
        to: lead.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      await params.prisma.emailOutreach.update({
        where: { id: outreach.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      await params.prisma.lead.update({
        where: { id: params.leadId },
        data: {
          contacted: true,
          lastContactedAt: new Date(),
          emailsSentCount: { increment: 1 },
        },
      });

      await smtp.close();

      return { success: true, outreachId: outreach.id };
    } catch (error) {
      await params.prisma.emailOutreach.update({
        where: { id: outreach.id },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      await smtp.close();

      throw error;
    }
  }

  async getLeadOutreach(leadId: string, scope: Scope, prisma: PrismaClient) {
    logger.info({ action: 'get-lead-outreach-start', leadId, scope: scope.type });
    const emailFilter = buildEmailFilter(scope);
    logger.info({ action: 'email-filter-built', emailFilter });
    const result = await prisma.emailOutreach.findMany({
      where: {
        ...emailFilter,
        leadId,
      },
      select: {
        id: true,
        leadId: true,
        userId: true,
        templateId: true,
        subject: true,
        htmlBody: true,
        textBody: true,
        variables: true,
        status: true,
        createdAt: true,
        sentAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    logger.info({ action: 'get-lead-outreach-success', leadId, count: result.length });
    return result;
  }

  async getOutreachStats(scope: Scope, prisma: PrismaClient) {
    const FOLLOW_UP_DAYS = 5;
    const emailFilter = buildEmailFilter(scope);

    const [total, sent, opened, replied, contactedLeads] = await Promise.all([
      prisma.emailOutreach.count({
        where: emailFilter,
      }),
      prisma.emailOutreach.count({
        where: { ...emailFilter, status: 'SENT' },
      }),
      prisma.emailOutreach.count({
        where: { ...emailFilter, status: 'OPENED' },
      }),
      prisma.emailOutreach.count({
        where: { ...emailFilter, status: 'REPLIED' },
      }),
      prisma.lead.count({
        where: { ...buildLeadFilter(scope), contacted: true },
      }),
    ]);

    const allOutreach = await prisma.emailOutreach.findMany({
      where: emailFilter,
      select: {
        leadId: true,
        status: true,
        sentAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const latestByLead = new Map<string, typeof allOutreach[0]>();
    for (const outreach of allOutreach) {
      if (!latestByLead.has(outreach.leadId)) {
        latestByLead.set(outreach.leadId, outreach);
      }
    }

    const now = Date.now();
    const needsFollowUp = Array.from(latestByLead.values()).filter(latest => {
      if (['REPLIED', 'BOUNCED', 'FAILED'].includes(latest.status)) return false;
      const lastContactDate = (latest.sentAt || latest.createdAt).getTime();
      const daysSince = (now - lastContactDate) / (1000 * 60 * 60 * 24);
      return daysSince >= FOLLOW_UP_DAYS;
    }).length;

    return {
      totalEmails: total,
      sentEmails: sent,
      openedEmails: opened,
      repliedEmails: replied,
      contactedLeads,
      needsFollowUp,
      openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
      replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
    };
  }

  async getAllOutreach(scope: Scope, prisma: PrismaClient) {
    const FOLLOW_UP_DAYS = 5;
    const emailFilter = buildEmailFilter(scope);

    const allOutreach = await prisma.emailOutreach.findMany({
      where: emailFilter,
      select: {
        id: true,
        leadId: true,
        subject: true,
        status: true,
        sentAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const latestByLead = new Map<string, typeof allOutreach[0]>();
    for (const outreach of allOutreach) {
      if (!latestByLead.has(outreach.leadId)) {
        latestByLead.set(outreach.leadId, outreach);
      }
    }

    const leadFilter = buildLeadFilter(scope);
    const leadsWithOutreach = await prisma.lead.findMany({
      where: {
        ...leadFilter,
        id: { in: Array.from(latestByLead.keys()) },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        domain: true,
        businessName: true,
        email: true,
        score: true,
        status: true,
        emailsSentCount: true,
        lastContactedAt: true,
      },
    });

    const now = Date.now();
    const rows = leadsWithOutreach
      .map((lead) => {
        const latest = latestByLead.get(lead.id)!;
        const lastContactDate = (latest.sentAt || latest.createdAt).getTime();
        const daysSinceLastContact = (now - lastContactDate) / (1000 * 60 * 60 * 24);
        const needsFollowUp = !['REPLIED', 'BOUNCED', 'FAILED'].includes(latest.status)
          && daysSinceLastContact >= FOLLOW_UP_DAYS;

        let sortPriority = 4;
        if (needsFollowUp) {
          sortPriority = 0;
        } else if (latest.status === 'OPENED' && daysSinceLastContact < FOLLOW_UP_DAYS) {
          sortPriority = 1;
        } else if (latest.status === 'SENT' && daysSinceLastContact < FOLLOW_UP_DAYS) {
          sortPriority = 2;
        } else if (latest.status === 'REPLIED') {
          sortPriority = 3;
        }

        const statusPriority = lead.status === 'HOT' ? 0 : lead.status === 'WARM' ? 1 : 2;

        return {
          leadId: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          domain: lead.domain,
          businessName: lead.businessName,
          email: lead.email,
          score: lead.score,
          status: lead.status,
          emailsSentCount: lead.emailsSentCount,
          lastContactedAt: lead.lastContactedAt,
          lastEmailId: latest.id,
          lastEmailSubject: latest.subject,
          lastEmailStatus: latest.status,
          lastEmailSentAt: latest.sentAt,
          lastEmailCreatedAt: latest.createdAt,
          daysSinceLastContact,
          needsFollowUp,
          sortPriority,
          statusPriority,
        };
      })
      .sort((a: { sortPriority: number; statusPriority: number; score: number }, b: { sortPriority: number; statusPriority: number; score: number }) => {
        if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
        if (a.statusPriority !== b.statusPriority) return a.statusPriority - b.statusPriority;
        return b.score - a.score;
      })
      .map(({ sortPriority, statusPriority, ...row }: { sortPriority: number; statusPriority: number; [key: string]: any }) => row);

    return rows;
  }
}
