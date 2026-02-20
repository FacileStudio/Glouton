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

    const allOutreach = await prisma.emailOutreach.findMany({
      where: { userId },
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

  async getAllOutreach(userId: string) {
    const FOLLOW_UP_DAYS = 5;

    const allOutreach = await prisma.emailOutreach.findMany({
      where: { userId },
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

    const leadsWithOutreach = await prisma.lead.findMany({
      where: {
        userId,
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
      .map(lead => {
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
      .sort((a, b) => {
        if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
        if (a.statusPriority !== b.statusPriority) return a.statusPriority - b.statusPriority;
        return b.score - a.score;
      })
      .map(({ sortPriority, statusPriority, ...row }) => row);

    return rows;
  }
}
