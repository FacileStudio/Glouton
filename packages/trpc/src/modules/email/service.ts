import type { PrismaClient } from '@repo/database';
import { SMTPService, renderTemplate, type EmailTemplate } from '@repo/smtp';

export class EmailService {
  /**
   * constructor
   */
  constructor(
    private db: PrismaClient,
    private smtp: SMTPService,
  ) {}

  /**
   * sendEmail
   */
  async sendEmail(params: {
    leadId: string;
    userId: string;
    templateId: string;
    variables: Record<string, string>;
  }) {
    const lead = await this.db.lead.findUnique({
      where: { id: params.leadId },
    });

    /**
     * if
     */
    if (!lead || !lead.email) {
      throw new Error('Lead not found or has no email');
    }

    const rendered = renderTemplate(params.templateId, params.variables);
    /**
     * if
     */
    if (!rendered) {
      throw new Error('Template not found');
    }

    const outreach = await this.db.emailOutreach.create({
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
    });

    try {
      await this.smtp.sendEmail({
        to: lead.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      await this.db.emailOutreach.update({
        where: { id: outreach.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      await this.db.lead.update({
        where: { id: params.leadId },
        data: {
          contacted: true,
          lastContactedAt: new Date(),
          emailsSentCount: {
            increment: 1,
          },
        },
      });

      return { success: true, outreachId: outreach.id };
    } catch (error) {
      await this.db.emailOutreach.update({
        where: { id: outreach.id },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  }

  /**
   * getLeadOutreach
   */
  async getLeadOutreach(leadId: string, userId: string) {
    return this.db.emailOutreach.findMany({
      where: {
        leadId,
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * getOutreachStats
   */
  async getOutreachStats(userId: string) {
    const [total, sent, opened, replied] = await Promise.all([
      this.db.emailOutreach.count({ where: { userId } }),
      this.db.emailOutreach.count({ where: { userId, status: 'SENT' } }),
      this.db.emailOutreach.count({ where: { userId, status: 'OPENED' } }),
      this.db.emailOutreach.count({ where: { userId, status: 'REPLIED' } }),
    ]);

    const contactedLeads = await this.db.lead.count({
      where: { userId, contacted: true },
    });

    return {
      totalEmails: total,
      sentEmails: sent,
      openedEmails: opened,
      repliedEmails: replied,
      contactedLeads,
      openRate: sent > 0 ? (opened / sent) * 100 : 0,
      replyRate: sent > 0 ? (replied / sent) * 100 : 0,
    };
  }
}
