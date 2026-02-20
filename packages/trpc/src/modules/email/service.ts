import { prisma } from '@repo/database/prisma';
import { SMTPService, renderTemplate, type EmailTemplate } from '@repo/smtp';

export class EmailService {
  constructor(
    private smtp: SMTPService,
  ) {}

  async sendEmail(params: {
    leadId: string;
    userId: string;
    templateId: string;
    variables: Record<string, string>;
  }) {
    const lead = await prisma.lead.findUnique({
      where: { id: params.leadId },
      select: { id: true, email: true },
    });

    if (!lead || !lead.email) {
      throw new Error('Lead not found or has no email');
    }

    const rendered = renderTemplate(params.templateId, params.variables);
    if (!rendered) {
      throw new Error('Template not found');
    }

    const outreach = await prisma.emailOutreach.create({
      data: {
        leadId: params.leadId,
        userId: params.userId,
        templateId: params.templateId,
        subject: rendered.subject,
        htmlBody: rendered.html,
        textBody: rendered.text,
        variables: params.variables,
        status: 'PENDING',
      },
      select: { id: true },
    });

    try {
      await this.smtp.sendEmail({
        to: lead.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      await prisma.emailOutreach.update({
        where: { id: outreach.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      await prisma.lead.update({
        where: { id: params.leadId },
        data: {
          contacted: true,
          lastContactedAt: new Date(),
          emailsSentCount: { increment: 1 },
        },
      });

      return { success: true, outreachId: outreach.id };
    } catch (error) {
      await prisma.emailOutreach.update({
        where: { id: outreach.id },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  }

  async getLeadOutreach(leadId: string, userId: string) {
    return prisma.emailOutreach.findMany({
      where: {
        leadId,
        userId,
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
  }

  async getOutreachStats(userId: string) {
    const FOLLOW_UP_DAYS = 5;

    const [total, sent, opened, replied, contactedLeads] = await Promise.all([
      prisma.emailOutreach.count({
        where: { userId },
      }),
      prisma.emailOutreach.count({
        where: { userId, status: 'SENT' },
      }),
      prisma.emailOutreach.count({
        where: { userId, status: 'OPENED' },
      }),
      prisma.emailOutreach.count({
        where: { userId, status: 'REPLIED' },
      }),
      prisma.lead.count({
        where: { userId, contacted: true },
      }),
    ]);

    const needsFollowUpResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT latest."leadId")::int as count
      FROM (
        SELECT DISTINCT ON ("leadId") "leadId", status, "sentAt", "createdAt"
        FROM "EmailOutreach"
        WHERE "userId" = ${userId}
        ORDER BY "leadId", "createdAt" DESC
      ) latest
      WHERE latest.status NOT IN ('REPLIED', 'BOUNCED', 'FAILED')
        AND EXTRACT(EPOCH FROM (NOW() - COALESCE(latest."sentAt", latest."createdAt"))) / 86400 >= ${FOLLOW_UP_DAYS}
    `;

    const needsFollowUp = Number(needsFollowUpResult[0]?.count ?? 0);

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

  async getAllOutreach(userId: string) {
    const FOLLOW_UP_DAYS = 5;

    const rows = await prisma.$queryRaw<Array<{
      leadId: string;
      firstName: string | null;
      lastName: string | null;
      domain: string | null;
      businessName: string | null;
      email: string | null;
      score: number;
      status: string;
      emailsSentCount: number;
      lastContactedAt: Date | null;
      lastEmailId: string;
      lastEmailSubject: string;
      lastEmailStatus: string;
      lastEmailSentAt: Date | null;
      lastEmailCreatedAt: Date;
      daysSinceLastContact: number;
      needsFollowUp: boolean;
    }>>`
      SELECT
        l.id as "leadId",
        l."firstName",
        l."lastName",
        l.domain,
        l."businessName",
        l.email,
        l.score,
        l.status,
        l."emailsSentCount",
        l."lastContactedAt",
        latest.id as "lastEmailId",
        latest.subject as "lastEmailSubject",
        latest.status as "lastEmailStatus",
        latest."sentAt" as "lastEmailSentAt",
        latest."createdAt" as "lastEmailCreatedAt",
        EXTRACT(EPOCH FROM (NOW() - COALESCE(latest."sentAt", latest."createdAt"))) / 86400 as "daysSinceLastContact",
        CASE
          WHEN latest.status NOT IN ('REPLIED', 'BOUNCED', 'FAILED')
            AND EXTRACT(EPOCH FROM (NOW() - COALESCE(latest."sentAt", latest."createdAt"))) / 86400 >= ${FOLLOW_UP_DAYS}
          THEN true
          ELSE false
        END as "needsFollowUp"
      FROM "Lead" l
      INNER JOIN (
        SELECT DISTINCT ON ("leadId") id, "leadId", subject, status, "sentAt", "createdAt"
        FROM "EmailOutreach"
        WHERE "userId" = ${userId}
        ORDER BY "leadId", "createdAt" DESC
      ) latest ON latest."leadId" = l.id
      WHERE l."userId" = ${userId}
      ORDER BY
        CASE
          WHEN latest.status NOT IN ('REPLIED', 'BOUNCED', 'FAILED')
            AND EXTRACT(EPOCH FROM (NOW() - COALESCE(latest."sentAt", latest."createdAt"))) / 86400 >= ${FOLLOW_UP_DAYS}
          THEN 0
          WHEN latest.status = 'OPENED'
            AND EXTRACT(EPOCH FROM (NOW() - COALESCE(latest."sentAt", latest."createdAt"))) / 86400 < ${FOLLOW_UP_DAYS}
          THEN 1
          WHEN latest.status = 'SENT'
            AND EXTRACT(EPOCH FROM (NOW() - COALESCE(latest."sentAt", latest."createdAt"))) / 86400 < ${FOLLOW_UP_DAYS}
          THEN 2
          WHEN latest.status = 'REPLIED' THEN 3
          ELSE 4
        END ASC,
        CASE l.status WHEN 'HOT' THEN 0 WHEN 'WARM' THEN 1 ELSE 2 END ASC,
        l.score DESC
    `;

    return rows;
  }
}
