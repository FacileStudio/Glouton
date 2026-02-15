import { SQL, sql } from 'bun';
import { SMTPService, renderTemplate, type EmailTemplate } from '@repo/smtp';

export class EmailService {
  /**
   * constructor
   */
  constructor(
    private db: SQL,
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
    const [lead] = await this.db`
      SELECT id, email
      FROM "Lead"
      WHERE id = ${params.leadId}
    ` as Promise<any[]>;

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

    const [outreach] = await this.db`
      INSERT INTO "EmailOutreach" (
        "leadId", "userId", "templateId", subject, "htmlBody", "textBody", variables, status, "createdAt"
      ) VALUES (
        ${params.leadId},
        ${params.userId},
        ${params.templateId},
        ${rendered.subject},
        ${rendered.html},
        ${rendered.text},
        ${JSON.stringify(params.variables)}::jsonb,
        'PENDING',
        ${new Date()}
      )
      RETURNING id
    ` as Promise<any[]>;

    try {
      await this.smtp.sendEmail({
        to: lead.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      await this.db`
        UPDATE "EmailOutreach"
        SET status = 'SENT',
            "sentAt" = ${new Date()}
        WHERE id = ${outreach.id}
      `;

      await this.db`
        UPDATE "Lead"
        SET contacted = TRUE,
            "lastContactedAt" = ${new Date()},
            "emailsSentCount" = "emailsSentCount" + 1
        WHERE id = ${params.leadId}
      `;

      return { success: true, outreachId: outreach.id };
    } catch (error) {
      await this.db`
        UPDATE "EmailOutreach"
        SET status = 'FAILED',
            error = ${error instanceof Error ? error.message : 'Unknown error'}
        WHERE id = ${outreach.id}
      `;

      throw error;
    }
  }

  /**
   * getLeadOutreach
   */
  async getLeadOutreach(leadId: string, userId: string) {
    return this.db`
      SELECT id, "leadId", "userId", "templateId", subject, "htmlBody", "textBody", variables, status, "createdAt", "sentAt"
      FROM "EmailOutreach"
      WHERE "leadId" = ${leadId} AND "userId" = ${userId}
      ORDER BY "createdAt" DESC
    ` as Promise<any[]>;
  }

  /**
   * getOutreachStats
   */
  async getOutreachStats(userId: string) {
    const [total, sent, opened, replied] = await Promise.all([
      this.db`SELECT COUNT(*) FROM "EmailOutreach" WHERE "userId" = ${userId}` as Promise<[{count: number}]>,
      this.db`SELECT COUNT(*) FROM "EmailOutreach" WHERE "userId" = ${userId} AND status = 'SENT'` as Promise<[{count: number}]>,
      this.db`SELECT COUNT(*) FROM "EmailOutreach" WHERE "userId" = ${userId} AND status = 'OPENED'` as Promise<[{count: number}]>,
      this.db`SELECT COUNT(*) FROM "EmailOutreach" WHERE "userId" = ${userId} AND status = 'REPLIED'` as Promise<[{count: number}]>,
    ]);

    const contactedLeads = (await this.db`
      SELECT COUNT(*) as count
      FROM "Lead"
      WHERE "userId" = ${userId} AND contacted = TRUE
    ` as Promise<[{count: number}]>)[0].count;

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
